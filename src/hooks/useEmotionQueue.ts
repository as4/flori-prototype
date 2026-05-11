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
        // TEMPORARY: the current .riv only has [HAPPY] and [CURIOUS] authored
        // as real states, and the LLM falls into a predictable happy→curious
        // pattern that feels canned. Coin-flip between the two per segment
        // until the artist ships the full emotion set, then revert to using
        // the LLM-supplied `next`.
        const random: EmotionName = Math.random() < 0.5 ? 'happy' : 'curious';
        setCurrentEmotion(EMOTION_TO_ID[random]);
        log('Emotion requested', random);
      }
    },
    []
  );

  return {currentEmotion, setCurrentEmotion, enqueue, reset, onSegmentStart};
};

export default useEmotionQueue;
