import {useState, useRef, useCallback, useEffect} from 'react';
import {log} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

const VISEME_HOLD_DURATION = 0.15;

// Declare playback intent at module load. iOS Safari 18 appears to bind the
// audio session category at first AudioContext construction; setting this only
// in a user gesture (when the context is created) is too late to override the
// silent switch on a fresh Safari launch.
(() => {
  const audioSession = (navigator as Navigator & {audioSession?: {type: string}}).audioSession;
  if (!audioSession) return;
  try { audioSession.type = 'playback'; } catch { /* unsupported */ }
})();

////////////////////////////////////////////////////////////////////////////////

export type VisemeEntry = {
  viseme: string;
  phone: string;
  start: number;
  duration: number;
  end?: number;
};

////////////////////////////////////////////////////////////////////////////////

type UseAudioPlaybackOptions = {
  muted?: boolean;
  onSegmentStart?: () => void;
};

const useAudioPlayback = ({muted, onSegmentStart}: UseAudioPlaybackOptions = {}) => {
  const [currentViseme, setCurrentViseme] = useState('sil');
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const silentLoopSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioPrimedRef = useRef(false);
  // Latest muted, read inside ensureAudioReady so the gain initializes
  // correctly when audio is unlocked while already muted.
  const mutedRef = useRef(Boolean(muted));
  mutedRef.current = Boolean(muted);

  // A "turn" spans multiple flushes (sentences). turnAudioStartRef anchors the
  // shared viseme timeline; nextStartTimeRef threads sequential segments
  // back-to-back via source.start(when).
  const visemeTimelineRef = useRef<VisemeEntry[]>([]);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const turnAudioStartRef = useRef<number | null>(null);
  const nextStartTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const tickStateRef = useRef({cursor: 0, lastViseme: 'sil', lastActiveEnd: 0});

  // Per-segment "started playing" timers. Web Audio has no onstart callback,
  // so we schedule a setTimeout to fire at the same offset source.start(startAt)
  // is set to. Tracked so cancel() can clear in-flight timers.
  const segmentStartTimersRef = useRef<number[]>([]);
  const onSegmentStartRef = useRef(onSegmentStart);
  onSegmentStartRef.current = onSegmentStart;

  // Live-update master gain when muted toggles mid-playback so the next
  // sample played comes out silenced (or unmuted) without restarting the
  // audio graph.
  useEffect(
    () => {
      const gain = masterGainRef.current;
      if (gain) gain.gain.value = +!muted;
    },
    [muted]
  );

  useEffect(
    () => () => {
      try { silentLoopSourceRef.current?.stop(); } catch { /* already stopped */ }
      silentLoopSourceRef.current = null;
    },
    []
  );

  //--------------------------------------------------------------------------
  //
  //  Helpers
  //
  //--------------------------------------------------------------------------

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
        if (silentLoopSourceRef.current) {
          try { silentLoopSourceRef.current.stop(); } catch { /* already stopped */ }
          silentLoopSourceRef.current = null;
        }
        rafIdRef.current = null;
        log('Playback finished');
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    },
    []
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
        masterGainRef.current.gain.value = +!mutedRef.current;
        masterGainRef.current.connect(audioContext.destination);
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(error => log('AudioContext resume failed', (error as Error).message));
      }

      // Try to suppress the iOS lock-screen Now Playing card. AudioContext
      // playback doesn't rely on these flags the way HTMLAudio does, so this
      // shouldn't break the silent-switch override.
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
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
    []
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
      for (const timerId of segmentStartTimersRef.current) {
        clearTimeout(timerId);
      }
      segmentStartTimersRef.current = [];
      scheduledSourcesRef.current = [];
      visemeTimelineRef.current = [];
      turnAudioStartRef.current = null;
      nextStartTimeRef.current = null;
      tickStateRef.current = {cursor: 0, lastViseme: 'sil', lastActiveEnd: 0};
      setCurrentViseme('sil');
      setIsPlaying(false);
      if (silentLoopSourceRef.current) {
        try { silentLoopSourceRef.current.stop(); } catch { /* already stopped */ }
        silentLoopSourceRef.current = null;
      }
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

      // Fire-and-forget resume. Awaiting it on iOS Safari can hang for tens
      // of seconds outside a user gesture, queuing every segment until the
      // next press releases them all at once — produces a crackly burst.
      // source.start() below schedules even while suspended; the source plays
      // once the context resumes (driven by the user's next gesture or the
      // silent-loop nudge above).
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(error => log('Segment resume failed', (error as Error).message));
      }

      // Start the silent looping source if it isn't already running. This is
      // what holds the iOS audio session in "playback" category so the silent
      // switch doesn't mute TTS. We deliberately keep it off during STT — a
      // permanently-playing source seems to confuse iOS into routing zero
      // audio to webkitSpeechRecognition after enough STT↔TTS swaps.
      if (!silentLoopSourceRef.current && masterGainRef.current) {
        const silentLoopBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
        const source = audioContext.createBufferSource();
        source.buffer = silentLoopBuffer;
        source.loop = true;
        source.connect(masterGainRef.current);

        try {
          source.start(0);
          silentLoopSourceRef.current = source;
        } catch (error) {
          log('Silent loop source start failed', (error as Error).message);
        }
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

      // Web Audio has no per-source onstart; mirror source.start(startAt) with
      // a setTimeout that fires the same instant. Used by App.tsx to apply
      // emotion changes in lockstep with each sentence's audio (LLM tags arrive
      // far ahead of playback, so naive on-tag firing desyncs face from voice).
      const delayMs = Math.max(0, (startAt - audioContext.currentTime) * 1000);
      const timerId = window.setTimeout(
        () => {
          segmentStartTimersRef.current = segmentStartTimersRef.current.filter(id => id !== timerId);
          onSegmentStartRef.current?.();
        },
        delayMs
      );
      segmentStartTimersRef.current.push(timerId);

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
    [decodeChunks, tick]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return {currentViseme, isPlaying, ensureAudioReady, appendSegment, cancel};
};

export default useAudioPlayback;
