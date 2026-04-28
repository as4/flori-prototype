import ProviderField from './ProviderField';
import {LLM_PROVIDER_IDS} from '../llm/providers';
import type {LLMProviderId, ProviderRuntime} from '../llm/providers';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  providers: Record<LLMProviderId, ProviderRuntime>;
  activeProviderId: LLMProviderId;
  onProviderChange: (id: LLMProviderId) => void;
};

const LLMConfig = ({providers, activeProviderId, onProviderChange}: Props) => {
  const active = providers[activeProviderId];

  return (
    <>
      <div className="form-group">
        <label>LLM provider</label>
        <div className="mode-switcher">
          {LLM_PROVIDER_IDS.map(
            id => (
              <button
                key={id}
                className={activeProviderId === id ? 'active' : ''}
                type="button"
                onClick={() => onProviderChange(id)}
              >
                {providers[id].label}
              </button>
            )
          )}
        </div>
      </div>

      {active.fields.map(
        field => (
          <ProviderField key={field.key} field={field} />
        )
      )}
    </>
  );
};

export default LLMConfig;
