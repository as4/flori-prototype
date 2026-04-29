import {useRef, useEffect, useState} from 'react';
import {Rive} from '@rive-app/canvas';
import {DEFAULT_RIV_URL} from '../config';
import {VISEME_TO_ID} from '../hooks/useInworldTTS';

////////////////////////////////////////////////////////////////////////////////

type StateMachineInput = {
  name: string;
  type: number;
  value: number;
  fire: () => void;
};

type RiveCharacterProps = {
  currentViseme: string;
  riveBuffer?: ArrayBuffer;
  inputName?: string;
};

////////////////////////////////////////////////////////////////////////////////

const RiveCharacter = ({currentViseme, riveBuffer, inputName = 'visemeId'}: RiveCharacterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<Rive | null>(null);
  const visemeInputRef = useRef<StateMachineInput | null>(null);

  // State
  const [bundledBuffer, setBundledBuffer] = useState<ArrayBuffer | null>(null);
  const [machineName, setMachineName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  ////////////////////////////////////////////////////////////////////////////////

  const activeBuffer = riveBuffer ?? bundledBuffer;

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Auto-load the bundled default .riv on first mount so the app renders a
  // character without requiring an upload. Skipped when a riveBuffer is
  // supplied externally (dev wrapper passes one in).
  useEffect(
    () => {
      if (riveBuffer) return;
      let cancelled = false;
      fetch(DEFAULT_RIV_URL)
        .then(response => {
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return response.arrayBuffer();
        })
        .then(buffer => {
          if (!cancelled) setBundledBuffer(buffer);
        })
        .catch(fetchError => {
          if (!cancelled) setError(`Couldn't load bundled .riv: ${(fetchError as Error).message}`);
        });
      return () => { cancelled = true; };
    },
    [riveBuffer]
  );

  // Load .riv and pick the single state machine. Splitting play() and
  // stateMachineInputs() into a separate effect gives Rive a tick to finish
  // initialising — calling them synchronously inside onLoad returns an empty
  // inputs list.
  useEffect(
    () => {
      if (!activeBuffer || !canvasRef.current) return;

      if (riveRef.current) {
        riveRef.current.cleanup();
        riveRef.current = null;
        visemeInputRef.current = null;
      }
      setMachineName(null);

      try {
        const rive = new Rive({
          buffer: activeBuffer,
          canvas: canvasRef.current,
          autoplay: false,
          onLoad: () => {
            const names = rive.stateMachineNames || [];
            const [firstMachine] = names;
            if (!firstMachine) {
              setError('No state machines found in .riv file');
              return;
            }
            riveRef.current = rive;
            rive.resizeDrawingSurfaceToCanvas();
            setMachineName(firstMachine);
          },
        });
      } catch (loadError) {
        setError(`Failed to load .riv: ${(loadError as Error).message}`);
      }

      return () => {
        if (riveRef.current) {
          riveRef.current.cleanup();
          riveRef.current = null;
          visemeInputRef.current = null;
        }
      };
    },
    [activeBuffer]
  );

  // Start the state machine and bind the viseme input.
  useEffect(
    () => {
      const rive = riveRef.current;
      if (!rive || !machineName) return;

      try {
        rive.play(machineName);
        const inputs = (rive.stateMachineInputs(machineName) || []) as StateMachineInput[];
        const visemeInput = inputs.find(input => input.name === inputName);
        if (!visemeInput) {
          const available = inputs.map(input => `${input.name} (${input.type})`).join(', ');
          setError(`Input "${inputName}" not found. Available: ${available || 'none'}`);
          visemeInputRef.current = null;
          return;
        }
        visemeInputRef.current = visemeInput;
        setError(null);
      } catch (playError) {
        setError(`State machine error: ${(playError as Error).message}`);
      }
    },
    [machineName, inputName]
  );

  // Drive the viseme input from currentViseme.
  useEffect(
    () => {
      if (!visemeInputRef.current) return;
      visemeInputRef.current.value = VISEME_TO_ID[currentViseme] ?? 0;
    },
    [currentViseme]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="character-stage">
      <canvas
        ref={canvasRef}
        className="rive-canvas"
        width={400}
        height={400}
      />
      {
        error &&
        <div className="rive-error">{error}</div>
      }
    </div>
  );
};

export default RiveCharacter;
