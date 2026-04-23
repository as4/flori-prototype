import {useRef, useEffect, useState, useCallback, type ChangeEvent} from 'react';
import {Rive} from '@rive-app/canvas';
import {DEFAULT_RIV_URL} from '../config';
import {VISEME_TO_ID} from '../hooks/useInworldTTS';
import VisemeFallback from './VisemeFallback';

////////////////////////////////////////////////////////////////////////////////

interface StateMachineInput {
  name: string;
  type: number;
  value: number;
  fire: () => void;
}

type DisplayMode = 'rive' | 'emoji' | 'svg';

interface RiveCharacterProps {
  currentViseme: string;
}

////////////////////////////////////////////////////////////////////////////////

const RiveCharacter = ({currentViseme}: RiveCharacterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<Rive | null>(null);
  const visemeInputRef = useRef<StateMachineInput | null>(null);

  // State
  const [mode, setMode] = useState<DisplayMode>('rive');
  const [riveFile, setRiveFile] = useState<ArrayBuffer | null>(null);
  const [stateMachines, setStateMachines] = useState<string[]>([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [inputName, setInputName] = useState('visemeId');
  const [riveReady, setRiveReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setRiveReady(false);
      setStateMachines([]);
      setSelectedMachine('');

      const reader = new FileReader();
      reader.onload = () => {
        setRiveFile(reader.result as ArrayBuffer);
      };
      reader.onerror = () => {
        setError('Failed to read .riv file');
      };
      reader.readAsArrayBuffer(file);
    },
    []
  );

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Auto-load the bundled default .riv on first mount so the app renders a
  // character without requiring an upload.
  useEffect(
    () => {
      let cancelled = false;
      fetch(DEFAULT_RIV_URL)
        .then(response => {
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return response.arrayBuffer();
        })
        .then(buffer => {
          if (!cancelled) setRiveFile(buffer);
        })
        .catch(fetchError => {
          if (!cancelled) setError(`Couldn't load bundled .riv: ${(fetchError as Error).message}`);
        });
      return () => { cancelled = true; };
    },
    []
  );

  // Load .riv file and discover state machines
  useEffect(
    () => {
      if (!riveFile || !canvasRef.current) return;

      if (riveRef.current) {
        riveRef.current.cleanup();
        riveRef.current = null;
        visemeInputRef.current = null;
      }

      try {
        const rive = new Rive({
          buffer: riveFile,
          canvas: canvasRef.current,
          autoplay: false,
          onLoad: () => {
            const names = rive.stateMachineNames || [];
            setStateMachines(names);

            const [firstMachine] = names;
            if (names.length === 1) {
              setSelectedMachine(firstMachine);
            } else if (names.length === 0) {
              setError('No state machines found in .riv file');
            }

            riveRef.current = rive;
            rive.resizeDrawingSurfaceToCanvas();
          },
        });
      } catch (error) {
        setError(`Failed to load .riv: ${(error as Error).message}`);
      }

      return () => {
        if (riveRef.current) {
          riveRef.current.cleanup();
          riveRef.current = null;
          visemeInputRef.current = null;
        }
      };
    },
    [riveFile]
  );

  // Start selected state machine and bind the viseme input
  useEffect(
    () => {
      const rive = riveRef.current;
      if (!rive || !selectedMachine) return;

      try {
        rive.play(selectedMachine);

        const inputs = (rive.stateMachineInputs(selectedMachine) || []) as StateMachineInput[];
        const visemeInput = inputs.find(
          input => input.name === inputName
        );

        if (visemeInput) {
          visemeInputRef.current = visemeInput;
          setRiveReady(true);
          setError(null);
        } else {
          const available = inputs.map(input => `${input.name} (${input.type})`).join(', ');
          setError(`Input "${inputName}" not found. Available: ${available || 'none'}`);
          setRiveReady(false);
        }
      } catch (error) {
        setError(`State machine error: ${(error as Error).message}`);
      }
    },
    [selectedMachine, inputName]
  );

  // Drive the viseme input from currentViseme
  useEffect(
    () => {
      if (!visemeInputRef.current) return;
      const visemeId = VISEME_TO_ID[currentViseme] ?? 0;
      visemeInputRef.current.value = visemeId;
    },
    [currentViseme]
  );

  // If Rive mode is active but we have an error or no binding, fall back to
  // emoji so the user still sees visemes reacting.
  useEffect(
    () => {
      if (mode === 'rive' && error && !riveReady) {
        setMode('emoji');
      }
    },
    [mode, error, riveReady]
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

        {
          stateMachines.length > 1 &&
          <select
            value={selectedMachine}
            onChange={event => setSelectedMachine(event.target.value)}
          >
            <option value="">Select state machine...</option>
            {stateMachines.map(
              name => (
                <option key={name} value={name}>{name}</option>
              )
            )}
          </select>
        }

        {
          selectedMachine &&
          <input
            className="input-name"
            type="text"
            value={inputName}
            placeholder="Viseme input name"
            onChange={event => setInputName(event.target.value)}
          />
        }
      </div>

      {
        error &&
        <div className="rive-error">{error}</div>
      }

      <div className="character-stage">
        <canvas
          ref={canvasRef}
          className="rive-canvas"
          style={{display: mode === 'rive' && riveFile ? 'block' : 'none'}}
          width={400}
          height={400}
        />

        {
          mode !== 'rive' &&
          <VisemeFallback mode={mode} currentViseme={currentViseme} />
        }
      </div>
    </div>
  );
};

export default RiveCharacter;
