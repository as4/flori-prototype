import _ from 'lodash';
import type {LLMAdapter, LLMStreamOptions} from '../adapter';

////////////////////////////////////////////////////////////////////////////////

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

////////////////////////////////////////////////////////////////////////////////

type BuildBodyArgs = Pick<LLMStreamOptions, 'systemPrompt' | 'history' | 'userText'> & {
  model: string;
};

const buildBody = ({systemPrompt, history, userText, model}: BuildBodyArgs) => ({
  model,
  messages: _.concat(
    {role: 'system', content: systemPrompt},
    _.map(
      history,
      turn => ({role: turn.role, content: turn.content})
    ),
    {role: 'user', content: userText}
  ),
  stream: true,
  // GPT-5+ and o-series reject the older max_tokens parameter and require
  // max_completion_tokens. Older gpt-4 models accept this name too as of
  // late 2024, so we use the newer name across the board.
  max_completion_tokens: 150,
  temperature: 0.8,
});

////////////////////////////////////////////////////////////////////////////////

export const createOpenAIAdapter = (apiKey: string, model: string): LLMAdapter => ({
  id: 'openai',
  label: 'OpenAI',
  stream: async ({systemPrompt, history, userText, signal, onChunk}) => {
    if (!apiKey) throw new Error('No OpenAI API key');

    const response = await fetch(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody({systemPrompt, history, userText, model})),
        signal,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI ${response.status}: ${errorBody.slice(0, 200)}`);
    }
    if (!response.body) {
      throw new Error('No response body from OpenAI');
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
