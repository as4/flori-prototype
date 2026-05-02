import _ from 'lodash';
import type {LLMAdapter, LLMStreamOptions} from '../adapter';

////////////////////////////////////////////////////////////////////////////////

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

////////////////////////////////////////////////////////////////////////////////

type BuildBodyArgs = Pick<LLMStreamOptions, 'systemPrompt' | 'history' | 'userText'> & {
  model: string;
  fastest: boolean;
};

const buildBody = ({systemPrompt, history, userText, model, fastest}: BuildBodyArgs) => {
  const messages = _.concat(
    {role: 'system', content: systemPrompt},
    _.map(
      history,
      turn => ({role: turn.role, content: turn.content})
    ),
    {role: 'user', content: userText}
  );

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    max_tokens: 150,
    temperature: 0.8,
    reasoning: {
      enabled: false,
      exclude: true,
    },
  };

  // Routes the request to whichever underlying provider is fastest right now
  // (e.g. Groq or Cerebras for Llama models). Without this OpenRouter sorts
  // by price by default, which can land on a slower backend.
  if (fastest) {
    body.provider = {sort: 'throughput'};
  }

  return body;
};

////////////////////////////////////////////////////////////////////////////////

export const createOpenRouterAdapter = (apiKey: string, model: string, fastest: boolean): LLMAdapter => ({
  id: 'openrouter',
  label: 'OpenRouter',
  stream: async ({systemPrompt, history, userText, signal, onChunk}) => {
    if (!apiKey) throw new Error('No OpenRouter API key');

    const response = await fetch(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          // OpenRouter uses these to attribute usage in their dashboard.
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Flori',
        },
        body: JSON.stringify(buildBody({systemPrompt, history, userText, model, fastest})),
        signal,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errorBody.slice(0, 200)}`);
    }
    if (!response.body) {
      throw new Error('No response body from OpenRouter');
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
          const text: string = json.choices?.[0]?.delta?.content ?? '';
          if (text) onChunk(text);
        } catch {
          // Malformed SSE fragment — keep streaming.
        }
      }
    }
  },
});
