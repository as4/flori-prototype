import {useState, useRef, useCallback} from 'react';
import type {ChatTurn, LLMAdapter} from '../llm/adapter';
import {EMOTION_TO_ID, type EmotionName} from '../emotions';

////////////////////////////////////////////////////////////////////////////////

const SENTENCE_TERMINATORS = /([.!?])(\s|$)/;

// Max length we'll hold an unclosed `[…` across chunk boundaries before
// giving up and flushing it as plain text. A real tag is at most
// "[empathetic]" = 12 chars; 24 leaves comfortable headroom for whitespace
// and bounds the buffer if the model emits a stray `[`.
const TAG_BUFFER_MAX = 24;

////////////////////////////////////////////////////////////////////////////////

type UseLLMChatOptions = {
  adapter: LLMAdapter;
  systemPrompt: string;
  onToken?: (text: string) => void;
  onSentence?: (sentence: string, emotion?: EmotionName) => void;
  onDone?: (fullText: string, rawText: string) => void;
  onError?: (message: string) => void;
};

////////////////////////////////////////////////////////////////////////////////

const useLLMChat = ({
  adapter,
  systemPrompt,
  onToken,
  onSentence,
  onDone,
  onError,
}: UseLLMChatOptions) => {
  const [isStreaming, setIsStreaming] = useState(false);

  const historyRef = useRef<ChatTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const onTokenRef = useRef(onToken);
  const onSentenceRef = useRef(onSentence);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);

  onTokenRef.current = onToken;
  onSentenceRef.current = onSentence;
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  //--------------------------------------------------------------------------
  //
  //  Callbacks
  //
  //--------------------------------------------------------------------------

  const reset = useCallback(
    () => {
      historyRef.current = [];
    },
    []
  );

  const cancel = useCallback(
    () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    },
    []
  );

  const send = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed) return;

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      historyRef.current.push({role: 'user', content: trimmed});

      setIsStreaming(true);
      let fullText = '';
      let rawText = '';
      let pendingBuffer = '';

      // Tag-stripping state. `leftover` holds an unclosed `[…` that arrived
      // at the end of a chunk. `emotionMarkers` records each tag at its
      // position in `pendingBuffer` so flushSentences can attach the correct
      // tag to each sentence even when multiple tags arrive in one chunk
      // before any sentence terminator (a single mutable pendingEmotion would
      // get overwritten and the first sentence would inherit the wrong tag).
      let leftover = '';
      const emotionMarkers: {position: number; emotion: EmotionName}[] = [];

      const stripTags = (incoming: string, baseOffset: number): string => {
        const working = leftover + incoming;
        leftover = '';
        let output = '';
        let cursor = 0;
        while (cursor < working.length) {
          const openIdx = working.indexOf('[', cursor);
          if (openIdx === -1) {
            output += working.slice(cursor);
            break;
          }
          output += working.slice(cursor, openIdx);
          const closeIdx = working.indexOf(']', openIdx + 1);
          if (closeIdx === -1) {
            const tail = working.slice(openIdx);
            if (tail.length <= TAG_BUFFER_MAX) {
              leftover = tail;
            } else {
              output += tail;
            }
            break;
          }
          const tagBody = working.slice(openIdx + 1, closeIdx).trim().toLowerCase();
          if (tagBody in EMOTION_TO_ID) {
            // Position is where the tag sits in the pendingBuffer once this
            // chunk's output is appended.
            emotionMarkers.push({
              position: baseOffset + output.length,
              emotion: tagBody as EmotionName,
            });
          } else {
            output += working.slice(openIdx, closeIdx + 1);
          }
          cursor = closeIdx + 1;
        }
        return output;
      };

      const flushSentences = () => {
        let match = pendingBuffer.match(SENTENCE_TERMINATORS);
        while (match) {
          const endIndex = (match.index ?? 0) + match[1].length;
          const sentence = pendingBuffer.slice(0, endIndex).trim();
          const remaining = pendingBuffer.slice(endIndex).trimStart();
          const consumedLength = pendingBuffer.length - remaining.length;
          pendingBuffer = remaining;

          if (sentence) {
            // Latest marker at-or-before the sentence terminator wins; drop
            // it and any earlier markers (already accounted for or stale).
            let emotion: EmotionName | undefined;
            let dropCount = 0;
            for (let i = 0; i < emotionMarkers.length; i++) {
              if (emotionMarkers[i].position > endIndex) break;
              emotion = emotionMarkers[i].emotion;
              dropCount = i + 1;
            }
            emotionMarkers.splice(0, dropCount);
            onSentenceRef.current?.(sentence, emotion);
          }

          // Shift remaining markers into the new buffer's coordinate space.
          // A marker inside the consumed prefix but past the sentence
          // terminator (i.e. tagged for the upcoming sentence) clamps to 0.
          for (const marker of emotionMarkers) {
            marker.position = Math.max(0, marker.position - consumedLength);
          }

          match = pendingBuffer.match(SENTENCE_TERMINATORS);
        }
      };

      try {
        await adapter.stream({
          systemPrompt,
          history: historyRef.current.slice(0, -1),
          userText: trimmed,
          signal: controller.signal,
          onChunk: text => {
            rawText += text;
            const cleaned = stripTags(text, pendingBuffer.length);
            if (!cleaned) return;
            fullText += cleaned;
            pendingBuffer += cleaned;
            onTokenRef.current?.(cleaned);
            flushSentences();
          },
        });

        if (leftover) {
          fullText += leftover;
          pendingBuffer += leftover;
          onTokenRef.current?.(leftover);
          leftover = '';
        }

        const tail = pendingBuffer.trim();
        if (tail) {
          // Latest queued marker wins for the un-terminated tail.
          const emotion = emotionMarkers[emotionMarkers.length - 1]?.emotion;
          emotionMarkers.length = 0;
          onSentenceRef.current?.(tail, emotion);
        }

        if (fullText.trim()) {
          historyRef.current.push({role: 'assistant', content: rawText});
          onDoneRef.current?.(fullText, rawText);
        } else {
          historyRef.current.pop();
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          onErrorRef.current?.((error as Error).message);
          historyRef.current.pop();
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [adapter, systemPrompt]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return {send, cancel, reset, isStreaming};
};

export default useLLMChat;
