import {useCallback} from 'react';
import useAudioPlayback from './useAudioPlayback';
import useInworldSocket from './useInworldSocket';

////////////////////////////////////////////////////////////////////////////////

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

type UseInworldTTSOptions = {
  apiKey: string;
  voiceId: string;
  modelId: string;
};

////////////////////////////////////////////////////////////////////////////////

const useInworldTTS = ({apiKey, voiceId, modelId}: UseInworldTTSOptions) => {
  const {currentViseme, isPlaying, ensureAudioReady, appendSegment, cancel: cancelPlayback} = useAudioPlayback();

  const {
    connectionStatus,
    connect,
    streamSentence,
    disconnect: socketDisconnect,
    clearPending,
  } = useInworldSocket({
    apiKey,
    voiceId,
    modelId,
    onSegment: appendSegment,
  });

  // TTS-side state only. The "processing" gap (LLM streaming, audio not yet
  // playing) is owned by App.tsx via useLLMChat's isStreaming flag — that's
  // the only signal that survives all the way through stream mode without
  // race conditions across sentence boundaries.
  const status: 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'error' =
    connectionStatus !== 'connected' ? connectionStatus as 'disconnected' | 'connecting' | 'error' :
    isPlaying ? 'speaking' :
    'connected';

  //--------------------------------------------------------------------------
  //
  //  Callbacks
  //
  //--------------------------------------------------------------------------

  // Reset playback + drop any chunks the server is still streaming for the
  // previous turn. App.tsx calls this on STT final and on barge-in.
  const beginTurn = useCallback(
    () => {
      cancelPlayback();
      clearPending();
    },
    [cancelPlayback, clearPending]
  );

  // Text-input fallback path: a one-shot send is just begin → sentence.
  const sendText = useCallback(
    (text: string) => {
      beginTurn();
      streamSentence(text);
    },
    [beginTurn, streamSentence]
  );

  const disconnect = useCallback(
    () => {
      cancelPlayback();
      socketDisconnect();
    },
    [cancelPlayback, socketDisconnect]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return {
    status,
    currentViseme,
    connect,
    beginTurn,
    streamSentence,
    sendText,
    stopPlayback: beginTurn,
    disconnect,
    ensureAudioReady,
  };
};

export default useInworldTTS;
