import {useState, useCallback, type ChangeEvent} from 'react';
import RiveCharacter from './RiveCharacter';
import VisemeFallback from './VisemeFallback';

////////////////////////////////////////////////////////////////////////////////

type DisplayMode = 'rive' | 'emoji' | 'svg';

const EMOTIONS = [
  {id: 0, label: 'Listening'},
  {id: 1, label: 'Empathetic'},
  {id: 2, label: 'Happy'},
  {id: 3, label: 'Curious'},
  {id: 4, label: 'Surprise'},
];

type RiveCharacterDevProps = {
  currentViseme: string;
};

////////////////////////////////////////////////////////////////////////////////

const RiveCharacterDev = ({currentViseme}: RiveCharacterDevProps) => {
  // State
  const [mode, setMode] = useState<DisplayMode>('rive');
  const [riveBuffer, setRiveBuffer] = useState<ArrayBuffer | undefined>();
  const [inputName, setInputName] = useState('visemeId');
  const [currentEmotion, setCurrentEmotion] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setReadError(null);

      const reader = new FileReader();
      reader.onload = () => {
        setRiveBuffer(reader.result as ArrayBuffer);
      };
      reader.onerror = () => {
        setReadError('Failed to read .riv file');
      };
      reader.readAsArrayBuffer(file);
    },
    []
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="rive-character">
      <div className="mode-switcher">
        <button
          className={mode === 'rive' ? 'active' : ''}
          type="button"
          onClick={() => setMode('rive')}
        >
          Rive
        </button>
        <button
          className={mode === 'emoji' ? 'active' : ''}
          type="button"
          onClick={() => setMode('emoji')}
        >
          Emoji
        </button>
        <button
          className={mode === 'svg' ? 'active' : ''}
          type="button"
          onClick={() => setMode('svg')}
        >
          SVG
        </button>
      </div>

      <div className="rive-controls">
        <label className="file-picker">
          <span>Upload .riv</span>
          <input
            type="file"
            accept=".riv"
            onChange={handleFileChange}
          />
        </label>

        <input
          className="input-name"
          type="text"
          value={inputName}
          placeholder="Viseme input name"
          onChange={event => setInputName(event.target.value)}
        />
      </div>

      <div className="mode-switcher">
        {
          EMOTIONS.map(
            emotion => (
              <button
                key={emotion.id}
                className={currentEmotion === emotion.id ? 'active' : ''}
                type="button"
                onClick={() => setCurrentEmotion(emotion.id)}
              >
                {emotion.label} ({emotion.id})
              </button>
            )
          )
        }
      </div>

      {
        readError &&
        <div className="rive-error">{readError}</div>
      }

      {
        mode === 'rive' ?
          <RiveCharacter
            riveBuffer={riveBuffer}
            currentViseme={currentViseme}
            inputName={inputName}
            currentEmotion={currentEmotion}
          />
          :
          <div className="character-stage">
            <VisemeFallback mode={mode} currentViseme={currentViseme}/>
          </div>
      }
    </div>
  );
};

export default RiveCharacterDev;
