import { useState, useRef, useCallback } from 'react';
import type { DebugEntry } from '../components/DebugConsole';

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
  onDebug?: (entry: DebugEntry) => void;
}

const useInworldTTS = ({ apiKey, voiceId, onDebug }: UseInworldTTSOptions) => {
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
      onDebug?.({ time: Date.now(), message, data });
    },
    [onDebug]
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

      // Sort timeline by start time and pre-compute end times
      timeline.sort((entryA, entryB) => entryA.start - entryB.start);
      for (const entry of timeline) {
        entry.end = entry.start + entry.duration;
      }

      log(`Playing ${chunks.length} audio chunks, ${timeline.length} viseme events`);

      // Decode all base64 chunks into a single audio buffer
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

      // Resume AudioContext if suspended (browser autoplay policy)
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

        // RAF loop to sync visemes to audio playback
        let cursor = 0;
        let lastViseme = 'sil';
        let lastActiveEnd = 0;
        const HOLD_DURATION = 0.15; // hold last viseme 150ms after it ends

        const tick = () => {
          if (!audioStartTimeRef.current) return;

          const elapsed = audioContext.currentTime - audioStartTimeRef.current;

          // Advance cursor past entries that have fully ended
          while (cursor < timeline.length && timeline[cursor].end! <= elapsed) {
            cursor++;
          }

          // Check if current cursor entry is active
          let activeViseme: string | null = null;
          if (cursor < timeline.length && elapsed >= timeline[cursor].start) {
            activeViseme = timeline[cursor].viseme;
            lastActiveEnd = timeline[cursor].end!;
          }

          // If no active viseme, hold the previous one briefly before going silent
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
      } catch (err) {
        log('Audio decode/play error', (err as Error).message);
        setStatus('connected');
      }
    },
    [log, stopPlayback]
  );

  // Keep ref in sync so WebSocket handler always calls latest version
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

      const ws = new WebSocket(`${WS_URL}?authorization=Basic ${encodeURIComponent(apiKey)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        log('WebSocket connected');
        setStatus('connected');

        // Create TTS context
        const createMsg = {
          create: {
            voiceId: voiceId || 'Hana',
            modelId: 'inworld-tts-1.5-max',
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
        log('Context created', { voiceId: voiceId || 'Hana' });
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          const result = msg.result;
          if (!result) return;

          // Audio chunk with viseme data
          if (result.audioChunk) {
            const { audioContent, timestampInfo } = result.audioChunk;

            if (audioContent) {
              audioChunksRef.current.push(audioContent);
            }

            // Extract phonetic details → viseme timeline
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

          // Flush completed — all audio received, start playback
          if (result.flushCompleted) {
            log('Flush completed — starting playback');
            startPlaybackRef.current();
          }

          // Context closed
          if (result.contextClosed) {
            log('Context closed');
          }

          // Error
          if (result.status?.code && result.status.code !== 0) {
            log('Server error', result.status);
          }
        } catch (err) {
          log('Message parse error', (err as Error).message);
        }
      };

      ws.onerror = () => {
        log('WebSocket error');
        setStatus('error');
      };

      ws.onclose = event => {
        log('WebSocket closed', { code: event.code, reason: event.reason });
        setStatus('disconnected');
        wsRef.current = null;
      };
    },
    [apiKey, voiceId, log, stopPlayback]
  );

  const sendText = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        log('WebSocket not connected');
        return;
      }

      // Reset for new utterance
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
        // Try to close context gracefully
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ close_context: {}, contextId: CONTEXT_ID }));
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
  };
};

export default useInworldTTS;
