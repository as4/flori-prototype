import {useState, useCallback, useRef, type ChangeEvent, type MouseEvent} from 'react';
import _ from 'lodash';
import RiveCharacter, {type RiveCharacterHandle} from '../RiveCharacter';
import VisemeFallback from './VisemeFallback';
import {EMOTIONS} from '../../emotions';
import {RIVE_TRIGGERS} from '../../config';

////////////////////////////////////////////////////////////////////////////////

type DisplayMode = 'rive' | 'emoji' | 'svg';

type RiveCharacterDevProps = {
  currentViseme: string;
  currentEmotion: number;
  useLLMEmotion: boolean;
  onCurrentEmotionChange: (emotion: number) => void;
  onUseLLMEmotionChange: (value: boolean) => void;
};

////////////////////////////////////////////////////////////////////////////////

const RiveCharacterDev = ({
  currentViseme,
  currentEmotion,
  useLLMEmotion,
  onCurrentEmotionChange,
  onUseLLMEmotionChange,
}: RiveCharacterDevProps) => {
  // State
  const [mode, setMode] = useState<DisplayMode>('rive');
  const [riveBuffer, setRiveBuffer] = useState<ArrayBuffer | undefined>();
  const [inputName, setInputName] = useState('visemeId');
  const [readError, setReadError] = useState<string | null>(null);

  const riveRef = useRef<RiveCharacterHandle>(null);

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleFireTrigger = useCallback(
    (name: string, event: MouseEvent<HTMLButtonElement>) => {
      riveRef.current?.fireTrigger(name);
      const button = event.currentTarget;
      // Re-add the class so the fade-out animation restarts on repeat
      // clicks; without removing/reflowing the browser ignores the second
      // add and the user sees no feedback the trigger fired.
      button.classList.remove('fired');
      void button.offsetWidth;
      button.classList.add('fired');
    },
    []
  );

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

      <div className="mode-switcher compact">
        {
          _.map(
            EMOTIONS,
            emotion => (
              <button
                key={emotion.id}
                className={currentEmotion === emotion.id ? 'active' : ''}
                type="button"
                disabled={useLLMEmotion}
                onClick={() => onCurrentEmotionChange(emotion.id)}
              >
                {emotion.label} ({emotion.id})
              </button>
            )
          )
        }
      </div>

      <div className="mode-switcher compact triggers-row">
        {
          _.map(
            RIVE_TRIGGERS,
            trigger => (
              <button
                key={trigger}
                type="button"
                onClick={event => handleFireTrigger(trigger, event)}
              >
                {trigger}
              </button>
            )
          )
        }
      </div>

      <label className="emotion-toggle">
        <input
          type="checkbox"
          checked={useLLMEmotion}
          onChange={event => onUseLLMEmotionChange(event.target.checked)}
        />
        <span>LLM-driven emotion</span>
      </label>

      {
        readError &&
        <div className="rive-error">{readError}</div>
      }

      {
        mode === 'rive' ?
          <RiveCharacter
            ref={riveRef}
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
