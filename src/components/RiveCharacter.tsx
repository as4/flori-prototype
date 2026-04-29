import {useRef, useEffect, useState} from 'react';
import {Rive} from '@rive-app/canvas';
import {DEFAULT_RIV_URL} from '../config';
import {VISEME_TO_ID} from '../hooks/useInworldTTS';
import {log} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

const EMOTION_INPUT_NAME = 'emotionId';

////////////////////////////////////////////////////////////////////////////////

type StateMachineInput = {
  name: string;
  type: number;
  value: number;
  fire: () => void;
};

type RiveCharacterProps = {
  riveBuffer?: ArrayBuffer;
  currentViseme: string;
  inputName?: string;
  currentEmotion?: number;
};

////////////////////////////////////////////////////////////////////////////////

const RiveCharacter = ({riveBuffer, currentViseme, inputName = 'visemeId', currentEmotion = 0}: RiveCharacterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<Rive | null>(null);
  const visemeInputRef = useRef<StateMachineInput | null>(null);
  const emotionInputRef = useRef<StateMachineInput | null>(null);

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
        emotionInputRef.current = null;
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
          emotionInputRef.current = null;
        }
      };
    },
    [activeBuffer]
  );

  // Start the state machine and bind inputs. The viseme input is required
  // (no lip-sync without it). The emotion input is optional — older .riv
  // files may not have it; warn and keep going.
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
          emotionInputRef.current = null;
          return;
        }
        visemeInputRef.current = visemeInput;

        const emotionInput = inputs.find(input => input.name === EMOTION_INPUT_NAME);
        if (emotionInput) {
          emotionInputRef.current = emotionInput;
        } else {
          emotionInputRef.current = null;
          log(`Rive: "${EMOTION_INPUT_NAME}" input not found — emotions disabled`);
        }

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

  // Drive the emotion input from currentEmotion. No-op when the .riv has no
  // emotion input bound.
  useEffect(
    () => {
      if (!emotionInputRef.current) return;
      emotionInputRef.current.value = currentEmotion;
    },
    [currentEmotion]
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
