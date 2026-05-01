import {EMOTIONS} from '../emotions';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
};

////////////////////////////////////////////////////////////////////////////////

const EmotionPromptEditor = ({value, defaultValue, onChange}: Props) => (
  <div className="form-group">
    <div className="form-label-row">
      <label htmlFor="emotion-prompt">Emotion tags prompt</label>
      {
        value !== defaultValue &&
        <button
          className="link-btn"
          type="button"
          onClick={() => onChange(defaultValue)}
        >
          Reset to default
        </button>
      }
    </div>
    <textarea
      id="emotion-prompt"
      value={value}
      rows={4}
      onChange={event => onChange(event.target.value)}
    />
    <div className="hint">
      Available tags: {EMOTIONS.map(emotion => `[${emotion.name.toUpperCase()}]`).join(' ')}
    </div>
  </div>
);

export default EmotionPromptEditor;
