import {useMemo} from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';
import {createOpenRouterAdapter} from './adapter';
import type {ProviderRuntime} from '../providers';

////////////////////////////////////////////////////////////////////////////////

const OPENROUTER_DEFAULT_MODEL = 'mistralai/ministral-3b-2512';

////////////////////////////////////////////////////////////////////////////////

const useOpenRouterProvider = (): ProviderRuntime => {
  const [apiKey, setApiKey] = useLocalStorage('flori-openrouter-key');
  const [model, setModel] = useLocalStorage('flori-openrouter-model', OPENROUTER_DEFAULT_MODEL);
  const [fastestStr, setFastestStr] = useLocalStorage('flori-openrouter-fastest', 'true');
  const fastest = fastestStr === 'true';

  const adapter = useMemo(
    () => createOpenRouterAdapter(apiKey, model, fastest),
    [apiKey, model, fastest]
  );

  return {
    id: 'openrouter',
    label: 'OpenRouter',
    apiKey,
    adapter,
    fields: [
      {
        type: 'secret',
        key: 'apiKey',
        label: 'OpenRouter key (for LLM)',
        placeholder: 'sk-or-v1-...',
        value: apiKey,
        onChange: setApiKey,
      },
      {
        type: 'text',
        key: 'model',
        label: 'OpenRouter model',
        placeholder: 'e.g. mistralai/ministral-3b-2512',
        value: model,
        onChange: setModel,
      },
      {
        type: 'toggle',
        key: 'fastest',
        label: 'Routing',
        onLabel: 'Fastest',
        offLabel: 'Standard',
        value: fastest,
        onChange: value => setFastestStr(value ? 'true' : 'false'),
      },
    ],
  };
};

export default useOpenRouterProvider;
