import useGeminiProvider from './google/provider';
import useOpenAIProvider from './openai/provider';
import useOpenRouterProvider from './openrouter/provider';
import type {LLMAdapter} from './adapter';

////////////////////////////////////////////////////////////////////////////////

export type ProviderField =
  | {
      type: 'secret';
      key: string;
      label: string;
      placeholder: string;
      value: string;
      onChange: (value: string) => void;
    }
  | {
      type: 'text';
      key: string;
      label: string;
      placeholder: string;
      value: string;
      onChange: (value: string) => void;
    }
  | {
      type: 'toggle';
      key: string;
      label: string;
      onLabel: string;
      offLabel: string;
      value: boolean;
      onChange: (value: boolean) => void;
    };

export type ProviderRuntime = {
  id: LLMProviderId;
  label: string;
  apiKey: string;
  adapter: LLMAdapter;
  fields: ProviderField[];
};

export const LLM_PROVIDER_IDS = ['gemini', 'openai', 'openrouter'] as const;
export type LLMProviderId = typeof LLM_PROVIDER_IDS[number];
export const DEFAULT_LLM_PROVIDER: LLMProviderId = 'gemini';

////////////////////////////////////////////////////////////////////////////////

export const useLLMProviders = (): Record<LLMProviderId, ProviderRuntime> => ({
  gemini: useGeminiProvider(),
  openai: useOpenAIProvider(),
  openrouter: useOpenRouterProvider(),
});
