import {useState, useRef, useCallback} from 'react';
import type {ChatTurn, LLMAdapter} from '../llm/adapter';

////////////////////////////////////////////////////////////////////////////////

const SENTENCE_TERMINATORS = /([.!?])(\s|$)/;

////////////////////////////////////////////////////////////////////////////////

type UseLLMChatOptions = {
  adapter: LLMAdapter;
  systemPrompt: string;
  onToken?: (text: string) => void;
  onSentence?: (sentence: string) => void;
  onDone?: (fullText: string) => void;
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
      let pendingBuffer = '';

      const flushSentences = () => {
        let match = pendingBuffer.match(SENTENCE_TERMINATORS);
        while (match) {
          const endIndex = (match.index ?? 0) + match[1].length;
          const sentence = pendingBuffer.slice(0, endIndex).trim();
          pendingBuffer = pendingBuffer.slice(endIndex).trimStart();
          if (sentence) {
            onSentenceRef.current?.(sentence);
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
            fullText += text;
            pendingBuffer += text;
            onTokenRef.current?.(text);
            flushSentences();
          },
        });

        const tail = pendingBuffer.trim();
        if (tail) {
          onSentenceRef.current?.(tail);
        }

        if (fullText.trim()) {
          historyRef.current.push({role: 'assistant', content: fullText});
          onDoneRef.current?.(fullText);
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
