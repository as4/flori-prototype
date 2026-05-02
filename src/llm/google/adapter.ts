import _ from 'lodash';
import type {LLMAdapter, LLMStreamOptions} from '../adapter';

////////////////////////////////////////////////////////////////////////////////

const endpointFor = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

////////////////////////////////////////////////////////////////////////////////

const buildBody = ({systemPrompt, history, userText}: Pick<LLMStreamOptions, 'systemPrompt' | 'history' | 'userText'>) => ({
  systemInstruction: {parts: [{text: systemPrompt}]},
  contents: _.concat(
    _.map(
      history,
      turn => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{text: turn.content}],
      })
    ),
    {role: 'user', parts: [{text: userText}]}
  ),
  generationConfig: {
    maxOutputTokens: 150,
    temperature: 0.8,
    thinkingConfig: {
      thinkingBudget: 0,
      includeThoughts: false,
    },
  },
});

////////////////////////////////////////////////////////////////////////////////

export const createGoogleAdapter = (apiKey: string, model: string): LLMAdapter => ({
  id: 'google',
  label: 'Gemini',
  stream: async ({systemPrompt, history, userText, signal, onChunk}) => {
    if (!apiKey) throw new Error('No Google AI API key');

    const response = await fetch(
      endpointFor(model, apiKey),
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(buildBody({systemPrompt, history, userText})),
        signal,
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
            if (text) onChunk(text);
          }
        } catch {
          // Malformed SSE fragment — keep streaming.
        }
      }
    }
  },
});
