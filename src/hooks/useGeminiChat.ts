import {useState, useRef, useCallback} from 'react';

////////////////////////////////////////////////////////////////////////////////

const MODEL = 'gemini-2.5-flash-lite';
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

const SENTENCE_TERMINATORS = /([.!?])(\s|$)/;

////////////////////////////////////////////////////////////////////////////////

interface GeminiTurn {
  role: 'user' | 'model';
  parts: {text: string}[];
}

interface UseGeminiChatOptions {
  apiKey: string;
  systemPrompt: string;
  onToken?: (text: string) => void;
  onSentence?: (sentence: string) => void;
  onDone?: (fullText: string) => void;
  onError?: (message: string) => void;
}

////////////////////////////////////////////////////////////////////////////////

const useGeminiChat = ({
  apiKey,
  systemPrompt,
  onToken,
  onSentence,
  onDone,
  onError,
}: UseGeminiChatOptions) => {
  const [isStreaming, setIsStreaming] = useState(false);

  const historyRef = useRef<GeminiTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const onTokenRef = useRef(onToken);
  const onSentenceRef = useRef(onSentence);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);

  onTokenRef.current = onToken;
  onSentenceRef.current = onSentence;
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

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
      if (!apiKey) {
        onErrorRef.current?.('No Google AI API key');
        return;
      }
      const trimmed = userText.trim();
      if (!trimmed) return;

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      historyRef.current.push({role: 'user', parts: [{text: trimmed}]});

      const body = {
        systemInstruction: {parts: [{text: systemPrompt}]},
        contents: historyRef.current,
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.8,
        },
      };

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
        const response = await fetch(
          ENDPOINT(apiKey),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json'},
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Gemini ${response.status}: ${errorBody.slice(0, 200)}`);
        }
        if (!response.body) {
          throw new Error('No response body from Gemini');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        while (true) {
          const {value, done} = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, {stream: true});
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;
            const payload = trimmedLine.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const json = JSON.parse(payload);
              const parts = json.candidates?.[0]?.content?.parts;
              if (!Array.isArray(parts)) continue;

              for (const part of parts) {
                const text: string = part?.text ?? '';
                if (!text) continue;

                fullText += text;
                pendingBuffer += text;
                onTokenRef.current?.(text);
                flushSentences();
              }
            } catch {
              // Malformed SSE fragment — keep streaming
            }
          }
        }

        const tail = pendingBuffer.trim();
        if (tail) {
          onSentenceRef.current?.(tail);
        }

        if (fullText.trim()) {
          historyRef.current.push({role: 'model', parts: [{text: fullText}]});
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
    [apiKey, systemPrompt]
  );

  return {send, cancel, reset, isStreaming};
};

export default useGeminiChat;
