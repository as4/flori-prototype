import {useCallback, useEffect, useRef, useState} from 'react';
import _ from 'lodash';
import {Rive, ViewModelInstance, ViewModelInstanceNumber} from '@rive-app/canvas';
import {DEFAULT_RIV_URL} from '../config';
import {VISEME_TO_ID} from '../hooks/useInworldTTS';
import {log} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

const EMOTION_INPUT_NAME = 'emotionId';

const VIEW_MODEL_NAME = 'data';
const VIEW_MODEL_INSTANCE_NAME = 'Instance';
const VISEME_PROP_NAME = 'viseme_id';
const EMOTION_PROP_NAME = 'emotion_id';

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
  onReady?: () => void;
};

////////////////////////////////////////////////////////////////////////////////

const RiveCharacter = ({riveBuffer, currentViseme, inputName = 'visemeId', currentEmotion = 0, onReady}: RiveCharacterProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<Rive | null>(null);
  const visemeInputRef = useRef<StateMachineInput | null>(null);
  const emotionInputRef = useRef<StateMachineInput | null>(null);
  const viewModelInstanceRef = useRef<ViewModelInstance | null>(null);
  const visemePropRef = useRef<ViewModelInstanceNumber | null>(null);
  const emotionPropRef = useRef<ViewModelInstanceNumber | null>(null);

  // State
  const [bundledBuffer, setBundledBuffer] = useState<ArrayBuffer | null>(null);
  const [machineName, setMachineName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  ////////////////////////////////////////////////////////////////////////////////

  const activeBuffer = riveBuffer ?? bundledBuffer;

  //--------------------------------------------------------------------------
  //
  //  Helpers
  //
  //--------------------------------------------------------------------------

  const cleanupRive = useCallback(
    () => {
      if (riveRef.current) {
        riveRef.current.cleanup();
        riveRef.current = null;
      }

      visemeInputRef.current = null;
      emotionInputRef.current = null;
      viewModelInstanceRef.current = null;
      visemePropRef.current = null;
      emotionPropRef.current = null;
    },
    []
  );

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

      cleanupRive();
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

      return cleanupRive;
    },
    [activeBuffer]
  );

  // Start the state machine and bind state. Prefer the data-binding
  // ViewModel ('data') when present — that's the partner-style contract.
  // Fall back to state machine inputs for older .riv files that haven't
  // migrated yet.
  useEffect(
    () => {
      const rive = riveRef.current;
      if (!rive || !machineName) return;

      try {
        rive.play(machineName);

        const dataVM = rive.viewModelByName(VIEW_MODEL_NAME);

        if (dataVM) {
          const instance = dataVM.instanceByName(VIEW_MODEL_INSTANCE_NAME)
            ?? dataVM.defaultInstance()
            ?? dataVM.instance();
          const visemeProp = instance.number(VISEME_PROP_NAME);
          const emotionProp = instance.number(EMOTION_PROP_NAME);

          if (visemeProp && emotionProp) {
            rive.bindViewModelInstance(instance);
            viewModelInstanceRef.current = instance;
            visemePropRef.current = visemeProp;
            emotionPropRef.current = emotionProp;
            visemeInputRef.current = null;
            emotionInputRef.current = null;
            setError(null);
            log(`Rive: bound '${VIEW_MODEL_NAME}' ViewModel`);
            return;
          }

          log(`Rive: '${VIEW_MODEL_NAME}' ViewModel missing ${VISEME_PROP_NAME}/${EMOTION_PROP_NAME} — falling back to inputs`);
        }

        const inputs = (rive.stateMachineInputs(machineName) || []) as StateMachineInput[];

        const visemeInput = _.find(inputs, {name: inputName});

        if (!visemeInput) {
          const available = _.map(inputs, input => `${input.name} (${input.type})`).join(', ');
          setError(`Input "${inputName}" not found. Available: ${available || 'none'}`);
          visemeInputRef.current = null;
          emotionInputRef.current = null;
          return;
        }

        visemeInputRef.current = visemeInput;

        const emotionInput = _.find(inputs, {name: EMOTION_INPUT_NAME});

        if (emotionInput) {
          emotionInputRef.current = emotionInput;
        } else {
          emotionInputRef.current = null;
          log(`Rive: "${EMOTION_INPUT_NAME}" input not found — emotions disabled`);
        }

        viewModelInstanceRef.current = null;
        visemePropRef.current = null;
        emotionPropRef.current = null;

        setError(null);
      } catch (playError) {
        setError(`State machine error: ${(playError as Error).message}`);
      }
    },
    [machineName, inputName]
  );

  // Drive the viseme value from currentViseme. Prefers the data-binding
  // ViewModel property when bound, falls back to the state machine input.
  useEffect(
    () => {
      const visemeId = VISEME_TO_ID[currentViseme] ?? 0;

      if (visemePropRef.current) {
        visemePropRef.current.value = visemeId;
      } else if (visemeInputRef.current) {
        visemeInputRef.current.value = visemeId;
      }
    },
    [currentViseme]
  );

  // Drive the emotion value from currentEmotion. No-op when neither path
  // is bound (e.g. older .riv with no emotion input).
  useEffect(
    () => {
      if (emotionPropRef.current) {
        emotionPropRef.current.value = currentEmotion;
        log(`Rive emotion ← ${currentEmotion} (ViewModel)`);
      } else if (emotionInputRef.current) {
        emotionInputRef.current.value = currentEmotion;
        log(`Rive emotion ← ${currentEmotion} (input)`);
      }
    },
    [currentEmotion]
  );

  // Fire onReady once the state machine is up and there's no error — caller
  // uses this to fade the character in only after the first frame is drawn.
  useEffect(
    () => {
      if (machineName && !error) onReady?.();
    },
    [machineName, error, onReady]
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
