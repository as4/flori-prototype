import _ from 'lodash';
import {log} from '../../utils/log';
import type {LLMAdapter, LLMStreamOptions} from '../adapter';

////////////////////////////////////////////////////////////////////////////////

const generateEndpoint = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

const cacheEndpoint = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(key)}`;

const CACHE_TTL = '3600s';

////////////////////////////////////////////////////////////////////////////////

const buildContents = (history: LLMStreamOptions['history'], userText: string) =>
  _.concat(
    _.map(
      history,
      turn => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{text: turn.content}],
      })
    ),
    {role: 'user', parts: [{text: userText}]}
  );

const generationConfig = {
  maxOutputTokens: 150,
  temperature: 0.8,
  thinkingConfig: {
    thinkingBudget: 0,
    includeThoughts: false,
  },
};

const buildBody = ({systemPrompt, history, userText}: Pick<LLMStreamOptions, 'systemPrompt' | 'history' | 'userText'>) => ({
  systemInstruction: {parts: [{text: systemPrompt}]},
  contents: buildContents(history, userText),
  generationConfig,
});

const buildBodyCached = ({cacheName, history, userText}: {cacheName: string} & Pick<LLMStreamOptions, 'history' | 'userText'>) => ({
  cachedContent: cacheName,
  contents: buildContents(history, userText),
  generationConfig,
});

////////////////////////////////////////////////////////////////////////////////

// Creates a server-side cached system instruction. The model arg is the
// short form (e.g. 'gemini-2.5-flash'); the API expects 'models/{model}'.
const createCachedContent = async (apiKey: string, model: string, systemPrompt: string): Promise<string> => {
  const response = await fetch(
    cacheEndpoint(apiKey),
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: `models/${model}`,
        systemInstruction: {parts: [{text: systemPrompt}]},
        ttl: CACHE_TTL,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cache create ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const json = await response.json();
  return json.name as string;
};

////////////////////////////////////////////////////////////////////////////////

// Streams a generate request, parses SSE chunks, and forwards text via
// onChunk. Returns the raw Response so the caller can branch on cache-miss
// errors (which come back as a 400/404 with a body referencing
// CachedContent / cachedContent).
const streamGenerate = async (
  url: string,
  body: unknown,
  signal: AbortSignal,
  onChunk: (text: string) => void
) => {
  const response = await fetch(
    url,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`Gemini ${response.status}: ${errorBody.slice(0, 200)}`);
    (error as Error & {body?: string; status?: number}).body = errorBody;
    (error as Error & {body?: string; status?: number}).status = response.status;
    throw error;
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
};

// Gemini returns a 400 (sometimes 404) referencing the cached content
// name when the cache has expired or been deleted. The error body is
// our best signal — match liberally.
const isCacheMissError = (error: unknown): boolean => {
  const withBody = error as Error & {body?: string; status?: number};
  if (!withBody?.body) return false;
  if (withBody.status !== 400 && withBody.status !== 404) return false;
  return /cachedContent|CachedContent/.test(withBody.body);
};

////////////////////////////////////////////////////////////////////////////////

export const createGoogleAdapter = (
  apiKey: string,
  model: string,
  cachedSystemPrompt?: string
): LLMAdapter => {
  let cachePromise: Promise<string | null> | null = null;

  const warmCache = () => {
    if (!apiKey || !cachedSystemPrompt) return;
    cachePromise = createCachedContent(apiKey, model, cachedSystemPrompt)
      .then(name => {
        log('Cache created', name);
        return name;
      })
      .catch(error => {
        log('Cache create failed', (error as Error).message);
        return null;
      });
  };

  // Eager creation — fire-and-forget. The first turn awaits this promise;
  // if it's resolved by then we use the cached path, otherwise we fall
  // back to the full systemInstruction body.
  warmCache();

  return {
    id: 'google',
    label: 'Gemini',
    stream: async ({systemPrompt, history, userText, signal, onChunk}) => {
      if (!apiKey) throw new Error('No Google AI API key');

      const url = generateEndpoint(model, apiKey);
      const cacheName = cachePromise ? await cachePromise : null;
      // Only use the cache if the consumer's prompt still matches what we
      // cached — covers the dev page where the prompt can change.
      const useCache = cacheName && systemPrompt === cachedSystemPrompt;

      if (useCache) {
        try {
          await streamGenerate(url, buildBodyCached({cacheName, history, userText}), signal, onChunk);
          return;
        } catch (error) {
          if (!isCacheMissError(error)) throw error;
          log('Cache miss → retrying without cache');
          cachePromise = null;
          warmCache();
          // Fall through to the uncached body.
        }
      }

      await streamGenerate(url, buildBody({systemPrompt, history, userText}), signal, onChunk);
    },
  };
};
