import React from 'react';
import type {CSSProperties} from 'react';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  className?: string;
  id?: string;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

// Masked text input with Safari-keychain dodges. Uses type="text" plus the
// -webkit-text-security style instead of type="password" — Safari aggressively
// nags to save anything typed into a password field to Keychain on tab close.
const SecretInput: React.FC<Props> = ({className, id, placeholder, value, disabled, onChange}) => (
  <input
    id={id}
    className={cn(
      'w-full px-4 py-3 rounded-3xl',
      'bg-white/[0.16] text-base text-white outline-none',
      'placeholder:text-white/40',
      'disabled:opacity-[0.48] disabled:cursor-not-allowed',
      className
    )}
    style={{WebkitTextSecurity: 'disc'} as CSSProperties}
    type="text"
    value={value}
    placeholder={placeholder}
    disabled={disabled}
    autoComplete="off"
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck={false}
    data-1p-ignore="true"
    data-lpignore="true"
    data-form-type="other"
    onChange={event => onChange?.(event.target.value)}
  />
);

export default SecretInput;
