import {useId} from 'react';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

// Masked text input for API keys. Stays as type="text" because Safari
// aggressively offers to save any type="password" value to the keychain;
// the .secret class applies -webkit-text-security so dots still render.
const SecretInput = ({label, placeholder, value, onChange}: Props) => {
  const id = useId();

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="secret"
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
};

export default SecretInput;
