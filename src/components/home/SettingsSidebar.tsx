import React, {useId, useState, useEffect} from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';
import SecretInput from './SecretInput';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

type FieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange?: (value: string) => void;
};

type Props = {
  open: boolean;
  onClose?: () => void;
};

////////////////////////////////////////////////////////////////////////////////

const Field: React.FC<FieldProps> = ({label, placeholder, value, onChange}) => {
  const id = useId();

  return (
    <div className="w-full flex flex-col items-start gap-4">
      <label
        className="text-base font-semibold text-white"
        htmlFor={id}
      >
        {label}
      </label>
      <SecretInput
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////

const SettingsSidebar: React.FC<Props> = ({open, onClose}) => {
  const [savedTts, setSavedTts] = useLocalStorage('flori-api-key');
  const [savedLlm, setSavedLlm] = useLocalStorage('flori-llm-key');

  const [draftTts, setDraftTts] = useState(savedTts);
  const [draftLlm, setDraftLlm] = useState(savedLlm);

  // Adopt saved values when they change from outside (e.g. another tab).
  useEffect(
    () => {
      setDraftTts(savedTts);
    },
    [savedTts]
  );

  useEffect(
    () => {
      setDraftLlm(savedLlm);
    },
    [savedLlm]
  );

  const isDirty = draftTts !== savedTts || draftLlm !== savedLlm;

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleUpdate = () => {
    setSavedTts(draftTts);
    setSavedLlm(draftLlm);
    onClose?.();
  };

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <aside
      className={cn(
        'fixed top-0 right-0 h-full w-[400px] p-12 z-[20]',
        'flex flex-col items-start gap-12',
        'bg-[#291C29]',
        'transition-transform duration-300 ease-out',
        open ? 'translate-x-0' : 'translate-x-full',
        !open && 'pointer-events-none'
      )}
      aria-hidden={!open}
    >
      <Field
        label="TTS API Key"
        placeholder="Paste your TTS API key..."
        value={draftTts}
        onChange={setDraftTts}
      />
      <Field
        label="LLM API Key"
        placeholder="Paste your LLM API key..."
        value={draftLlm}
        onChange={setDraftLlm}
      />

      <button
        className={cn(
          'px-6 py-3 rounded-full',
          'bg-[#FF5A7D] text-base font-semibold text-white',
          'transition-opacity duration-150',
          isDirty ? 'opacity-100 cursor-pointer' : 'opacity-[0.48] cursor-default'
        )}
        type="button"
        disabled={!isDirty}
        onClick={handleUpdate}
      >
        Update
      </button>
    </aside>
  );
};

export default SettingsSidebar;
