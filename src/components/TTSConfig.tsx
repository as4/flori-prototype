import {useId} from 'react';
import SecretInput from './SecretInput';
import {TTS_MODELS} from '../config';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  apiKey: string;
  voiceId: string;
  modelId: string;
  isConnected: boolean;
  streamMode: boolean;
  onApiKeyChange: (value: string) => void;
  onVoiceIdChange: (value: string) => void;
  onModelIdChange: (value: string) => void;
  onStreamModeChange: (value: boolean) => void;
};

const TTSConfig = ({
  apiKey,
  voiceId,
  modelId,
  isConnected,
  streamMode,
  onApiKeyChange,
  onVoiceIdChange,
  onModelIdChange,
  onStreamModeChange,
}: Props) => {
  const voiceIdFieldId = useId();

  return (
    <>
      <SecretInput
        label="InWorld API Key (for TTS)"
        placeholder="Base64 InWorld key..."
        value={apiKey}
        onChange={onApiKeyChange}
      />

      <div className="form-group">
        <label htmlFor={voiceIdFieldId}>Voice ID</label>
        <input
          id={voiceIdFieldId}
          type="text"
          value={voiceId}
          placeholder="e.g. Hana, Dennis, Ashley..."
          onChange={event => onVoiceIdChange(event.target.value)}
        />
      </div>

      <div className="form-group">
        <div className="form-label-row">
          <label>TTS model</label>
          {
            isConnected &&
            <span className="hint">reconnect to apply</span>
          }
        </div>
        <div className="mode-switcher">
          {TTS_MODELS.map(
            model => (
              <button
                key={model.id}
                className={modelId === model.id ? 'active' : ''}
                type="button"
                onClick={() => onModelIdChange(model.id)}
              >
                {model.label}
              </button>
            )
          )}
        </div>
      </div>

      <div className="form-group">
        <div className="form-label-row">
          <label>TTS delivery</label>
          <span className="hint">{streamMode ? 'sentence-by-sentence' : 'wait for full reply'}</span>
        </div>
        <div className="mode-switcher">
          <button
            className={streamMode ? 'active' : ''}
            type="button"
            onClick={() => onStreamModeChange(true)}
          >
            Stream
          </button>
          <button
            className={!streamMode ? 'active' : ''}
            type="button"
            onClick={() => onStreamModeChange(false)}
          >
            One-shot
          </button>
        </div>
      </div>
    </>
  );
};

export default TTSConfig;
