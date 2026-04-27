import {useState, useEffect, useCallback} from 'react';
import useAudioPlayback from './useAudioPlayback';
import useInworldSocket from './useInworldSocket';
import type {DebugEntry} from '../components/DebugConsole';

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

interface UseInworldTTSOptions {
  apiKey: string;
  voiceId: string;
  modelId: string;
  onDebug?: (entry: DebugEntry) => void;
}

////////////////////////////////////////////////////////////////////////////////

const useInworldTTS = ({apiKey, voiceId, modelId, onDebug}: UseInworldTTSOptions) => {
  // The "sentence sent, audio not yet playing" gap. Cleared by the effect
  // below as soon as audio actually starts (or on barge-in via beginTurn).
  const [isProcessing, setIsProcessing] = useState(false);

  const {currentViseme, isPlaying, ensureAudioReady, appendSegment, cancel: cancelPlayback} = useAudioPlayback({
    onDebug,
  });

  const {
    connectionStatus,
    connect,
    streamSentence: socketStreamSentence,
    disconnect: socketDisconnect,
    clearPending,
  } = useInworldSocket({
    apiKey,
    voiceId,
    modelId,
    onSegment: appendSegment,
    onDebug,
  });

  useEffect(
    () => {
      if (isPlaying) setIsProcessing(false);
    },
    [isPlaying]
  );

  const status =
    connectionStatus !== 'connected' ? connectionStatus :
    isPlaying ? 'speaking' :
    isProcessing ? 'processing' :
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
      setIsProcessing(false);
      cancelPlayback();
      clearPending();
    },
    [cancelPlayback, clearPending]
  );

  const streamSentence = useCallback(
    (text: string) => {
      setIsProcessing(true);
      socketStreamSentence(text);
    },
    [socketStreamSentence]
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
