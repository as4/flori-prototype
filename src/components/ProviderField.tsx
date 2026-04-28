import {useId} from 'react';
import SecretInput from './SecretInput';
import type {ProviderField as ProviderFieldDef} from '../llm/providers';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  field: ProviderFieldDef;
};

const ProviderField = ({field}: Props) => {
  const id = useId();

  if (field.type === 'secret') {
    return (
      <SecretInput
        label={field.label}
        placeholder={field.placeholder}
        value={field.value}
        onChange={field.onChange}
      />
    );
  }

  if (field.type === 'text') {
    return (
      <div className="form-group">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          type="text"
          value={field.value}
          placeholder={field.placeholder}
          onChange={event => field.onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="form-group">
      <label>{field.label}</label>
      <div className="mode-switcher">
        <button
          className={field.value ? 'active' : ''}
          type="button"
          onClick={() => field.onChange(true)}
        >
          {field.onLabel}
        </button>
        <button
          className={!field.value ? 'active' : ''}
          type="button"
          onClick={() => field.onChange(false)}
        >
          {field.offLabel}
        </button>
      </div>
    </div>
  );
};

export default ProviderField;
