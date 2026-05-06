import {useState, useRef, useCallback} from 'react';
import {EMOTION_TO_ID, type EmotionName} from '../emotions';
import {log} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

type Options = {
  enabled: boolean;
};

////////////////////////////////////////////////////////////////////////////////

// Per-sentence emotion queue tied to TTS audio playback.
//
// The LLM emits all sentence tags within ~150ms but audio plays for ~5s.
// Queueing at enqueue (when each sentence is handed to TTS) and shifting at
// onSegmentStart (when the matching audio actually starts) keeps face changes
// in lockstep with voice. When enabled is false, queued tags are still
// shifted off but not applied — the LLM may still emit [TAG]s out of habit
// because past replies in chat history prime the pattern.
const useEmotionQueue = ({enabled}: Options) => {
  const [currentEmotion, setCurrentEmotion] = useState(0);

  const pendingRef = useRef<(EmotionName | undefined)[]>([]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  //--------------------------------------------------------------------------
  //
  //  Callbacks
  //
  //--------------------------------------------------------------------------

  const enqueue = useCallback(
    (emotion: EmotionName | undefined) => {
      pendingRef.current.push(emotion);
      if (emotion) log('Emotion enqueued', emotion);
    },
    []
  );

  const reset = useCallback(
    () => {
      pendingRef.current = [];
    },
    []
  );

  const onSegmentStart = useCallback(
    () => {
      const next = pendingRef.current.shift();
      if (next && enabledRef.current) {
        setCurrentEmotion(EMOTION_TO_ID[next]);
        log('Emotion requested', next);
      }
    },
    []
  );

  return {currentEmotion, setCurrentEmotion, enqueue, reset, onSegmentStart};
};

export default useEmotionQueue;
