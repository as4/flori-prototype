////////////////////////////////////////////////////////////////////////////////

type Props = {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
};

const PersonaEditor = ({value, defaultValue, onChange}: Props) => (
  <div className="form-group">
    <div className="form-label-row">
      <label htmlFor="persona">Persona / system prompt</label>
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
      id="persona"
      value={value}
      rows={4}
      onChange={event => onChange(event.target.value)}
    />
  </div>
);

export default PersonaEditor;
