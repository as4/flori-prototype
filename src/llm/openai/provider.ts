import {useMemo} from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';
import {createOpenAIAdapter} from './adapter';
import type {ProviderRuntime} from '../providers';

////////////////////////////////////////////////////////////////////////////////

const OPENAI_DEFAULT_MODEL = 'gpt-5.4-mini';

////////////////////////////////////////////////////////////////////////////////

const useOpenAIProvider = (): ProviderRuntime => {
  const [apiKey, setApiKey] = useLocalStorage('flori-openai-key');
  const [model, setModel] = useLocalStorage('flori-openai-model', OPENAI_DEFAULT_MODEL);

  const adapter = useMemo(
    () => createOpenAIAdapter(apiKey, model),
    [apiKey, model]
  );

  return {
    id: 'openai',
    label: 'OpenAI',
    apiKey,
    adapter,
    fields: [
      {
        type: 'secret',
        key: 'apiKey',
        label: 'OpenAI key (for LLM)',
        placeholder: 'sk-...',
        value: apiKey,
        onChange: setApiKey,
      },
      {
        type: 'text',
        key: 'model',
        label: 'OpenAI model',
        placeholder: 'e.g. gpt-5.4-mini, gpt-4o-mini',
        value: model,
        onChange: setModel,
      },
    ],
  };
};

export default useOpenAIProvider;
