import React, {useId, useState, useEffect} from 'react';
import SecretInput from './SecretInput';
import {cn} from '../../utils/cn';
import {getLogs} from '../../utils/log';

////////////////////////////////////////////////////////////////////////////////

const COPY_FEEDBACK_MS = 1500;

////////////////////////////////////////////////////////////////////////////////

type FieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

type Props = {
  open: boolean;
  ttsKey: string;
  llmKey: string;
  isConnected?: boolean;
  ttftMs?: number | null;
  ttfaMs?: number | null;
  onClose?: () => void;
  onSave?: (next: {ttsKey: string; llmKey: string}) => void;
  onDisconnect?: () => void;
};

////////////////////////////////////////////////////////////////////////////////

const Field: React.FC<FieldProps> = ({label, placeholder, value, disabled, onChange}) => {
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
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////

const formatLatency = (ms: number | null | undefined) =>
  typeof ms === 'number' ? `${ms}ms` : '—';

const formatLogs = () => getLogs().map(
  entry => {
    const time = new Date(entry.time).toISOString().slice(11, 23);
    const data = entry.data === undefined ?
      ''
      :
      ` ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}`;
    return `${time} ${entry.message}${data}`;
  }
).join('\n');

////////////////////////////////////////////////////////////////////////////////

const SettingsSidebar: React.FC<Props> = ({
  open,
  ttsKey,
  llmKey,
  isConnected,
  ttftMs,
  ttfaMs,
  onClose,
  onSave,
  onDisconnect,
}) => {
  const [draftTts, setDraftTts] = useState(ttsKey);
  const [draftLlm, setDraftLlm] = useState(llmKey);
  const [logsCopied, setLogsCopied] = useState(false);

  // Adopt saved values when they change from outside (e.g. /dev page edits).
  useEffect(
    () => {
      setDraftTts(ttsKey);
    },
    [ttsKey]
  );

  useEffect(
    () => {
      setDraftLlm(llmKey);
    },
    [llmKey]
  );

  const isDirty = draftTts !== ttsKey || draftLlm !== llmKey;
  const updateActive = isDirty && !isConnected;
  const showLatency = ttftMs != null || ttfaMs != null;

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleUpdate = () => {
    onSave?.({ttsKey: draftTts, llmKey: draftLlm});
    onClose?.();
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(formatLogs());
      setLogsCopied(true);
      window.setTimeout(() => setLogsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard write rejected (e.g. iOS in non-secure context). Silent
      // fail — the user will know nothing changed.
    }
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
        disabled={isConnected}
        onChange={setDraftTts}
      />
      <Field
        label="LLM API Key"
        placeholder="Paste your LLM API key..."
        value={draftLlm}
        disabled={isConnected}
        onChange={setDraftLlm}
      />

      <div className="w-full flex flex-col items-start gap-4">
        <button
          className={cn(
            'px-6 py-3 rounded-full',
            'bg-[#FF5A7D] text-base font-semibold text-white',
            'transition-opacity duration-150',
            updateActive ? 'opacity-100 cursor-pointer' : 'opacity-[0.48] cursor-default'
          )}
          type="button"
          disabled={!updateActive}
          onClick={handleUpdate}
        >
          Update
        </button>

        {
          isConnected &&
          <>
            <p className="text-sm text-white/[0.48]">Disconnect to edit keys</p>
            <button
              className={cn(
                'px-6 py-3 rounded-full border-2 border-[#FF5A7D]',
                'text-base font-semibold text-white',
                'cursor-pointer'
              )}
              type="button"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </>
        }
      </div>

      <div className="mt-auto w-full flex flex-col items-start gap-3">
        <button
          className={cn(
            'px-4 py-2 rounded-full border border-white/[0.16]',
            'text-sm font-semibold text-white/[0.72]',
            'cursor-pointer'
          )}
          type="button"
          onClick={handleCopyLogs}
        >
          {logsCopied ? 'Copied!' : 'Copy logs'}
        </button>

        {
          showLatency &&
          <p className="text-sm font-mono text-white/[0.48]">
            TTFT {formatLatency(ttftMs)} • TTFA {formatLatency(ttfaMs)}
          </p>
        }
      </div>
    </aside>
  );
};

export default SettingsSidebar;
