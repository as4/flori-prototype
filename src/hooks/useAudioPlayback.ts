import {useState, useRef, useCallback} from 'react';
import type {DebugEntry} from '../components/DebugConsole';

////////////////////////////////////////////////////////////////////////////////

const VISEME_HOLD_DURATION = 0.15;

////////////////////////////////////////////////////////////////////////////////

export interface VisemeEntry {
  viseme: string;
  phone: string;
  start: number;
  duration: number;
  end?: number;
}

interface UseAudioPlaybackOptions {
  onDebug?: (entry: DebugEntry) => void;
}

////////////////////////////////////////////////////////////////////////////////

const useAudioPlayback = ({onDebug}: UseAudioPlaybackOptions = {}) => {
  const [currentViseme, setCurrentViseme] = useState('sil');
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const audioPrimedRef = useRef(false);

  // A "turn" spans multiple flushes (sentences). turnAudioStartRef anchors the
  // shared viseme timeline; nextStartTimeRef threads sequential segments
  // back-to-back via source.start(when).
  const visemeTimelineRef = useRef<VisemeEntry[]>([]);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const turnAudioStartRef = useRef<number | null>(null);
  const nextStartTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const tickStateRef = useRef({cursor: 0, lastViseme: 'sil', lastActiveEnd: 0});

  //--------------------------------------------------------------------------
  //
  //  Helpers
  //
  //--------------------------------------------------------------------------

  const log = useCallback(
    (message: string, data?: DebugEntry['data']) => {
      onDebug?.({time: Date.now(), message, data});
    },
    [onDebug]
  );

  const decodeChunks = useCallback(
    async (chunks: string[]) => {
      const audioContext = audioContextRef.current!;
      const binaryChunks = chunks.map(
        base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
      );
      const totalLength = binaryChunks.reduce(
        (sum, chunk) => sum + chunk.length, 0
      );
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of binaryChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      return audioContext.decodeAudioData(combined.buffer);
    },
    []
  );

  // RAF tick that drives both the viseme state and the speaking transition.
  // We use AudioContext.currentTime vs nextStartTimeRef as the source of truth
  // for "is audio still playing" — relying on AudioBufferSourceNode.onended is
  // flaky in practice (especially on iOS Safari) and leaves the UI stuck at
  // "Speaking" when a source ends without firing the event.
  const tick = useCallback(
    () => {
      const audioContext = audioContextRef.current;
      const turnStart = turnAudioStartRef.current;
      if (!audioContext || turnStart === null) {
        rafIdRef.current = null;
        return;
      }

      const elapsed = audioContext.currentTime - turnStart;
      const timeline = visemeTimelineRef.current;
      const state = tickStateRef.current;

      while (state.cursor < timeline.length && timeline[state.cursor].end! <= elapsed) {
        state.cursor++;
      }

      let activeViseme: string | null = null;
      if (state.cursor < timeline.length && elapsed >= timeline[state.cursor].start) {
        activeViseme = timeline[state.cursor].viseme;
        state.lastActiveEnd = timeline[state.cursor].end!;
      }

      if (!activeViseme) {
        activeViseme = elapsed - state.lastActiveEnd < VISEME_HOLD_DURATION ?
          state.lastViseme
          :
          'sil';
      }

      if (activeViseme !== state.lastViseme) {
        setCurrentViseme(activeViseme);
        state.lastViseme = activeViseme;
      }

      const nextStart = nextStartTimeRef.current ?? turnStart;
      if (audioContext.currentTime >= nextStart) {
        setCurrentViseme('sil');
        scheduledSourcesRef.current = [];
        setIsPlaying(false);
        rafIdRef.current = null;
        log('Playback finished');
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [log]
  );

  //--------------------------------------------------------------------------
  //
  //  Callbacks
  //
  //--------------------------------------------------------------------------

  // Call inside a user gesture (button press) to unlock audio on Safari.
  // Desktop Safari is happy with resume(); iOS Safari also requires us to play
  // something during the gesture, so we queue a 1-sample silent buffer the
  // first time. Subsequent calls only resume — replaying the silent buffer on
  // every press collides with iOS SFSpeechRecognizer ("Source is stopped").
  const ensureAudioReady = useCallback(
    () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      if (!masterGainRef.current) {
        masterGainRef.current = audioContext.createGain();
        masterGainRef.current.gain.value = 1;
        masterGainRef.current.connect(audioContext.destination);
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(error => log('AudioContext resume failed', (error as Error).message));
      }
      // On iOS, declare our audio as "playback" so the silent/ringer switch
      // doesn't mute Flori. Supported since Safari 17.
      const audioSession = (navigator as Navigator & {audioSession?: {type: string}}).audioSession;
      if (audioSession) {
        try { audioSession.type = 'playback'; } catch { /* unsupported type */ }
      }
      if (audioPrimedRef.current) return;
      try {
        const silent = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = silent;
        source.connect(audioContext.destination);
        source.start(0);
        audioPrimedRef.current = true;
      } catch (error) {
        log('Silent-buffer prime failed', (error as Error).message);
      }
    },
    [log]
  );

  const cancel = useCallback(
    () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      for (const source of scheduledSourcesRef.current) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      scheduledSourcesRef.current = [];
      visemeTimelineRef.current = [];
      turnAudioStartRef.current = null;
      nextStartTimeRef.current = null;
      tickStateRef.current = {cursor: 0, lastViseme: 'sil', lastActiveEnd: 0};
      setCurrentViseme('sil');
      setIsPlaying(false);
    },
    []
  );

  // Decode one segment's chunks and schedule playback right after the previous
  // segment in the same turn. Visemes are merged into the global timeline at
  // the segment's offset.
  const appendSegment = useCallback(
    async (chunks: string[], visemes: VisemeEntry[]) => {
      if (chunks.length === 0) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      let buffer: AudioBuffer;
      try {
        buffer = await decodeChunks(chunks);
      } catch (error) {
        log('Audio decode error', (error as Error).message);
        return;
      }

      // Lead time: Safari silently drops sources scheduled at or before
      // currentTime. Always push the start at least 20ms into the future.
      const earliest = audioContext.currentTime + 0.02;
      const startAt = Math.max(nextStartTimeRef.current ?? earliest, earliest);
      const isFirstSegment = turnAudioStartRef.current === null;

      if (isFirstSegment) {
        turnAudioStartRef.current = startAt;
        tickStateRef.current = {cursor: 0, lastViseme: 'sil', lastActiveEnd: 0};
      }

      // InWorld phone timestamps are relative to each flush's audio (start = 0),
      // so we offset by the segment's scheduled start within the turn.
      const offset = startAt - turnAudioStartRef.current!;
      for (const entry of visemes) {
        const start = entry.start + offset;
        visemeTimelineRef.current.push({
          ...entry,
          start,
          end: start + entry.duration,
        });
      }
      visemeTimelineRef.current.sort((entryA, entryB) => entryA.start - entryB.start);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGainRef.current ?? audioContext.destination);
      source.start(startAt);
      scheduledSourcesRef.current.push(source);

      nextStartTimeRef.current = startAt + buffer.duration;

      // Start (or re-arm) the tick whenever a segment is scheduled — handles
      // both the first segment of a turn and segments arriving after a gap
      // long enough to have stopped the previous tick.
      if (rafIdRef.current === null) {
        setIsPlaying(true);
        rafIdRef.current = requestAnimationFrame(tick);
      }

      // Quick RMS check on a slice of the buffer — tells us if decode produced
      // real samples or silence (e.g., when InWorld's per-flush MP3 chunks
      // don't form a standalone decodable stream).
      const samples = buffer.getChannelData(0);
      const sliceLen = Math.min(samples.length, 4096);
      let rmsAcc = 0;
      for (let i = 0; i < sliceLen; i++) rmsAcc += samples[i] * samples[i];
      const rms = Math.sqrt(rmsAcc / sliceLen);

      log('Segment scheduled', {
        startAt: startAt.toFixed(3),
        currentTime: audioContext.currentTime.toFixed(3),
        duration: buffer.duration.toFixed(3),
        contextState: audioContext.state,
        rms: rms.toFixed(5),
        visemes: visemes.length,
      });
    },
    [decodeChunks, log, tick]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return {currentViseme, isPlaying, ensureAudioReady, appendSegment, cancel};
};

export default useAudioPlayback;
