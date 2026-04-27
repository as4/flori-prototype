import {useState, useRef, useCallback} from 'react';
import type {DebugEntry} from '../components/DebugConsole';
import type {VisemeEntry} from './useAudioPlayback';

////////////////////////////////////////////////////////////////////////////////

const WS_URL = 'wss://api.inworld.ai/tts/v1/voice:streamBidirectional';
const CONTEXT_ID = 'flori-ctx';

////////////////////////////////////////////////////////////////////////////////

interface UseInworldSocketOptions {
  apiKey: string;
  voiceId: string;
  modelId: string;
  onSegment: (chunks: string[], visemes: VisemeEntry[]) => void;
  onDebug?: (entry: DebugEntry) => void;
}

////////////////////////////////////////////////////////////////////////////////

const useInworldSocket = ({apiKey, voiceId, modelId, onSegment, onDebug}: UseInworldSocketOptions) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  // Per-flush buffers — chunks/visemes for the segment InWorld is currently
  // synthesising. Drained on each flushCompleted into onSegment().
  const pendingChunksRef = useRef<string[]>([]);
  const pendingVisemesRef = useRef<VisemeEntry[]>([]);
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

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

  const clearPending = useCallback(
    () => {
      pendingChunksRef.current = [];
      pendingVisemesRef.current = [];
    },
    []
  );

  //--------------------------------------------------------------------------
  //
  //  Callbacks
  //
  //--------------------------------------------------------------------------

  const connect = useCallback(
    () => {
      if (!apiKey) {
        log('No API key provided');
        return;
      }

      setConnectionStatus('connecting');
      clearPending();

      const ws = new WebSocket(`${WS_URL}?authorization=Basic ${encodeURIComponent(apiKey)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        log('WebSocket connected');
        setConnectionStatus('connected');

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
            applyTextNormalization: 'ON',
            // Each send_text + flush_context becomes its own standalone MP3
            // batch — necessary so per-flush decodeAudioData sees a complete
            // file. With autoMode: true the server collapses flushes into one
            // continuous bitstream and per-flush decoding produces silence.
            autoMode: false,
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
              pendingChunksRef.current.push(audioContent);
            }
            const wordAlignment = timestampInfo?.wordAlignment;
            if (wordAlignment?.phoneticDetails) {
              for (const wordDetail of wordAlignment.phoneticDetails) {
                if (!wordDetail.phones) continue;
                for (const phone of wordDetail.phones) {
                  pendingVisemesRef.current.push({
                    viseme: phone.visemeSymbol || 'sil',
                    phone: phone.phoneSymbol,
                    start: phone.startTimeSeconds,
                    duration: phone.durationSeconds,
                  });
                }
              }
            }
            if (wordAlignment?.words) {
              log('Words received', wordAlignment.words.join(' '));
            }
          }

          if (result.flushCompleted) {
            log('Flush completed');
            const chunks = pendingChunksRef.current;
            const visemes = pendingVisemesRef.current;
            pendingChunksRef.current = [];
            pendingVisemesRef.current = [];
            onSegmentRef.current(chunks, visemes);
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
        setConnectionStatus('error');
      };

      ws.onclose = event => {
        log('WebSocket closed', {code: event.code, reason: event.reason});
        setConnectionStatus('disconnected');
        wsRef.current = null;
      };
    },
    [apiKey, voiceId, modelId, log, clearPending]
  );

  const streamSentence = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        log('WebSocket not connected');
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) return;

      ws.send(JSON.stringify({
        send_text: {text: trimmed, flush_context: {}},
        contextId: CONTEXT_ID,
      }));
      log('Sentence sent', trimmed);
    },
    [log]
  );

  const disconnect = useCallback(
    () => {
      clearPending();
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({close_context: {}, contextId: CONTEXT_ID}));
          ws.close();
        }
        wsRef.current = null;
      }
      setConnectionStatus('disconnected');
      log('Disconnected');
    },
    [clearPending, log]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return {connectionStatus, connect, streamSentence, disconnect, clearPending};
};

export default useInworldSocket;
