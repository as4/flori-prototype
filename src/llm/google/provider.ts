import {useMemo} from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';
import {createGoogleAdapter} from './adapter';
import type {ProviderRuntime} from '../providers';

////////////////////////////////////////////////////////////////////////////////

const useGeminiProvider = (): ProviderRuntime => {
  const [apiKey, setApiKey] = useLocalStorage('flori-google-ai-key');
  const [model, setModel] = useLocalStorage('flori-gemini-model', 'gemini-2.5-flash-lite');

  const adapter = useMemo(
    () => createGoogleAdapter(apiKey, model),
    [apiKey, model]
  );

  return {
    id: 'gemini',
    label: 'Gemini',
    apiKey,
    adapter,
    fields: [
      {
        type: 'secret',
        key: 'apiKey',
        label: 'Google AI key (for LLM)',
        placeholder: 'Google AI Studio key (free tier)...',
        value: apiKey,
        onChange: setApiKey,
      },
      {
        type: 'text',
        key: 'model',
        label: 'Gemini model',
        placeholder: 'e.g. gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.5-pro...',
        value: model,
        onChange: setModel,
      },
    ],
  };
};

export default useGeminiProvider;
