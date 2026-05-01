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
      // at the end of a chunk. `pendingEmotion` is the latest tag we've seen
      // but haven't yet attached to a sentence — claimed by the next flush.
      let leftover = '';
      let pendingEmotion: EmotionName | null = null;

      const stripTags = (incoming: string): string => {
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
            pendingEmotion = tagBody as EmotionName;
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
          pendingBuffer = pendingBuffer.slice(endIndex).trimStart();
          if (sentence) {
            const emotion = pendingEmotion ?? undefined;
            pendingEmotion = null;
            onSentenceRef.current?.(sentence, emotion);
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
            const cleaned = stripTags(text);
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
          const emotion = pendingEmotion ?? undefined;
          pendingEmotion = null;
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
