import {useState, useRef, useCallback} from 'react';
import type {DebugEntry} from '../components/DebugConsole';

////////////////////////////////////////////////////////////////////////////////

const WS_URL = 'wss://api.inworld.ai/tts/v1/voice:streamBidirectional';
const CONTEXT_ID = 'flori-ctx';

export const VISEME_TO_ID: Record<string, number> = {
  sil: 0,
  aei: 1,
  o: 2,
  ee: 3,
  bmp: 4,
  fv: 5,
  l: 6,
  r: 7,
  th: 8,
  qw: 9,
  cdgknstxyz: 10,
};

////////////////////////////////////////////////////////////////////////////////

interface VisemeEntry {
  viseme: string;
  phone: string;
  start: number;
  duration: number;
  end?: number;
}

interface UseInworldTTSOptions {
  apiKey: string;
  voiceId: string;
  modelId: string;
  onDebug?: (entry: DebugEntry) => void;
}

////////////////////////////////////////////////////////////////////////////////

const useInworldTTS = ({apiKey, voiceId, modelId, onDebug}: UseInworldTTSOptions) => {
  const [status, setStatus] = useState('disconnected');
  const [currentViseme, setCurrentViseme] = useState('sil');

  const wsRef = useRef<WebSocket | null>(null);
  const audioChunksRef = useRef<string[]>([]);
  const visemeTimelineRef = useRef<VisemeEntry[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStartTimeRef = useRef<number | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startPlaybackRef = useRef<() => void>(() => {});

  const log = useCallback(
    (message: string, data?: DebugEntry['data']) => {
      onDebug?.({time: Date.now(), message, data});
    },
    [onDebug]
  );

  const audioPrimedRef = useRef(false);

  // Call inside a user gesture (button press) to unlock audio on Safari.
  // Desktop Safari is happy with resume(); iOS Safari also requires us to
  // actually play something during the gesture, so we queue a 1-sample silent
  // buffer the first time. Subsequent calls only resume — replaying the silent
  // buffer on every press collides with iOS SFSpeechRecognizer and surfaces as
  // "Source is stopped".
  const ensureAudioReady = useCallback(
    () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
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

  const stopPlayback = useCallback(
    () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch { /* already stopped */ }
        sourceNodeRef.current = null;
      }
      audioStartTimeRef.current = null;
      setCurrentViseme('sil');
    },
    []
  );

  const startPlayback = useCallback(
    async () => {
      const chunks = audioChunksRef.current;
      const timeline = visemeTimelineRef.current;

      if (chunks.length === 0) {
        log('No audio chunks to play');
        return;
      }

      timeline.sort((entryA, entryB) => entryA.start - entryB.start);
      for (const entry of timeline) {
        entry.end = entry.start + entry.duration;
      }

      log(`Playing ${chunks.length} audio chunks, ${timeline.length} viseme events`);

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

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      try {
        const audioBuffer = await audioContext.decodeAudioData(combined.buffer);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        sourceNodeRef.current = source;
        audioStartTimeRef.current = audioContext.currentTime;
        source.start(0);

        setStatus('speaking');
        log('Audio playback started');

        let cursor = 0;
        let lastViseme = 'sil';
        let lastActiveEnd = 0;
        // Hold the last viseme 150ms after it ends so natural gaps between
        // phonemes don't flicker to silence.
        const HOLD_DURATION = 0.15;

        const tick = () => {
          if (!audioStartTimeRef.current) return;

          const elapsed = audioContext.currentTime - audioStartTimeRef.current;

          while (cursor < timeline.length && timeline[cursor].end! <= elapsed) {
            cursor++;
          }

          let activeViseme: string | null = null;
          if (cursor < timeline.length && elapsed >= timeline[cursor].start) {
            activeViseme = timeline[cursor].viseme;
            lastActiveEnd = timeline[cursor].end!;
          }

          if (!activeViseme) {
            activeViseme = elapsed - lastActiveEnd < HOLD_DURATION ?
              lastViseme
              :
              'sil';
          }

          if (activeViseme !== lastViseme) {
            setCurrentViseme(activeViseme);
            lastViseme = activeViseme;
          }

          if (elapsed < audioBuffer.duration) {
            rafIdRef.current = requestAnimationFrame(tick);
          } else {
            setCurrentViseme('sil');
            setStatus('connected');
            audioStartTimeRef.current = null;
            log('Playback finished');
          }
        };

        rafIdRef.current = requestAnimationFrame(tick);

        source.onended = () => {
          stopPlayback();
          setStatus('connected');
          log('Audio source ended');
        };
      } catch (error) {
        log('Audio decode/play error', (error as Error).message);
        setStatus('connected');
      }
    },
    [log, stopPlayback]
  );

  // Keep the ref in sync so the WebSocket handler always calls the latest version.
  startPlaybackRef.current = startPlayback;

  const connect = useCallback(
    () => {
      if (!apiKey) {
        log('No API key provided');
        return;
      }

      setStatus('connecting');
      stopPlayback();
      audioChunksRef.current = [];
      visemeTimelineRef.current = [];

      // Create/resume AudioContext inside this user gesture so Safari allows
      // playback later when audio arrives after async STT/LLM work. iOS also
      // needs a silent buffer played during the gesture — handled in
      // ensureAudioReady().
      ensureAudioReady();

      const ws = new WebSocket(`${WS_URL}?authorization=Basic ${encodeURIComponent(apiKey)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        log('WebSocket connected');
        setStatus('connected');

        const createMsg = {
          create: {
            voiceId: voiceId || 'Hana',
            modelId,
            audioConfig: {
              audioEncoding: 'MP3',
              sampleRateHertz: 48000,
              bitRate: 128000,
              speakingRate: 1.0,
            },
            temperature: 1.0,
            timestampType: 'WORD',
            maxBufferDelayMs: 1000,
            bufferCharThreshold: 1000,
            applyTextNormalization: 'ON',
            autoMode: true,
            timestampTransportStrategy: 'SYNC',
          },
          contextId: CONTEXT_ID,
        };

        ws.send(JSON.stringify(createMsg));
        log('Context created', {voiceId: voiceId || 'Hana'});
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          const result = msg.result;
          if (!result) return;

          if (result.audioChunk) {
            const {audioContent, timestampInfo} = result.audioChunk;

            if (audioContent) {
              audioChunksRef.current.push(audioContent);
            }

            const wordAlignment = timestampInfo?.wordAlignment;
            if (wordAlignment?.phoneticDetails) {
              for (const wordDetail of wordAlignment.phoneticDetails) {
                if (!wordDetail.phones) continue;
                for (const phone of wordDetail.phones) {
                  visemeTimelineRef.current.push({
                    viseme: phone.visemeSymbol || 'sil',
                    phone: phone.phoneSymbol,
                    start: phone.startTimeSeconds,
                    duration: phone.durationSeconds,
                  });
                  log('Viseme', {
                    phone: phone.phoneSymbol,
                    viseme: phone.visemeSymbol,
                    start: phone.startTimeSeconds.toFixed(3),
                    duration: phone.durationSeconds.toFixed(3),
                  });
                }
              }
            }

            if (wordAlignment?.words) {
              log('Words received', wordAlignment.words.join(' '));
            }
          }

          if (result.flushCompleted) {
            log('Flush completed — starting playback');
            startPlaybackRef.current();
          }

          if (result.contextClosed) {
            log('Context closed');
          }

          if (result.status?.code && result.status.code !== 0) {
            log('Server error', result.status);
          }
        } catch (error) {
          log('Message parse error', (error as Error).message);
        }
      };

      ws.onerror = () => {
        log('WebSocket error');
        setStatus('error');
      };

      ws.onclose = event => {
        log('WebSocket closed', {code: event.code, reason: event.reason});
        setStatus('disconnected');
        wsRef.current = null;
      };
    },
    [apiKey, voiceId, modelId, log, stopPlayback]
  );

  const sendText = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        log('WebSocket not connected');
        return;
      }

      audioChunksRef.current = [];
      visemeTimelineRef.current = [];
      stopPlayback();

      const sendMsg = {
        send_text: {
          text,
          flush_context: {},
        },
        contextId: CONTEXT_ID,
      };

      ws.send(JSON.stringify(sendMsg));
      setStatus('processing');
      log('Text sent', text);
    },
    [log, stopPlayback]
  );

  const disconnect = useCallback(
    () => {
      stopPlayback();

      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({close_context: {}, contextId: CONTEXT_ID}));
          ws.close();
        }
        wsRef.current = null;
      }

      setStatus('disconnected');
      log('Disconnected');
    },
    [stopPlayback, log]
  );

  return {
    status,
    currentViseme,
    connect,
    sendText,
    disconnect,
    ensureAudioReady,
  };
};

export default useInworldTTS;
