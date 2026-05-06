import {useCallback, useEffect, useState, type PointerEvent} from 'react';
import _ from 'lodash';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';
import useMicLevels, {unlockAudioContext} from '../../hooks/useMicLevels';
import useInterimLevels from '../../hooks/useInterimLevels';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

const BAR_COUNT = 6;
const IDLE_BARS = [8, 16, 32, 12, 20, 8];

const ACTIVE_BAR_MIN_PX = 6;
const ACTIVE_BAR_MAX_PX = 32;

////////////////////////////////////////////////////////////////////////////////

const PttButton = () => {
  const [isPressed, setIsPressed] = useState(false);

  const {stream, interim, isListening, start, stop} = useSpeechRecognition();
  const realLevels = useMicLevels(stream, BAR_COUNT);
  const fallbackLevels = useInterimLevels(isListening && !stream, interim, BAR_COUNT);
  const levels = stream ? realLevels : fallbackLevels;

  //--------------------------------------------------------------------------
  //
  //  Callbacks
  //
  //--------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      // Lock subsequent pointer events to this button so the press state
      // releases reliably even if the finger drifts off on iOS.
      event.currentTarget.setPointerCapture(event.pointerId);
      // Resume the AudioContext synchronously inside this user gesture so the
      // analyser graph is 'running' by the time useMicLevels' effect attaches.
      unlockAudioContext();
      setIsPressed(true);
      start();
    },
    [start]
  );

  const handlePressEnd = useCallback(
    () => {
      setIsPressed(false);
      stop();
    },
    [stop]
  );

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Space hold = pointer hold; matches the "Hold Space to speak" hint.
  useEffect(
    () => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        if (event.repeat) return;
        unlockAudioContext();
        setIsPressed(true);
        start();
      };
      const handleKeyUp = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        setIsPressed(false);
        stop();
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    },
    [start, stop]
  );

  ////////////////////////////////////////////////////////////////////////////////

  const bars = isPressed ?
    _.map(levels, level => ACTIVE_BAR_MIN_PX + level * (ACTIVE_BAR_MAX_PX - ACTIVE_BAR_MIN_PX))
    :
    IDLE_BARS;

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="relative w-[72px] h-[72px]">
      <div
        className={cn(
          'absolute inset-0 -m-8 rounded-full bg-[#FF5A7D]/10',
          'animate-halo-slow transition-opacity duration-300',
          isPressed ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        className={cn(
          'absolute inset-0 -m-4 rounded-full bg-[#FF5A7D]/25',
          'animate-halo transition-opacity duration-300',
          isPressed ? 'opacity-100' : 'opacity-0'
        )}
      />

      <button
        className={cn(
          'relative w-full h-full rounded-full border-2',
          'flex items-center justify-center gap-1',
          'select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]',
          'cursor-pointer transition-[background-color,box-shadow,border-color] duration-300',
          isPressed
            ? 'bg-[#FF5A7D] border-transparent shadow-[0_0_0_8px_#FF5A7D]'
            : 'bg-gradient-to-b from-white to-white/75 border-white shadow-[0_4px_16px_rgba(0,0,0,0.02)]'
        )}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePressEnd}
        onPointerCancel={handlePressEnd}
      >
        {
          _.map(
            bars,
            (height, index) => (
              <span
                key={index}
                className={cn(
                  'block w-[2.5px] rounded-full',
                  'transition-[background-color] duration-200',
                  isPressed ? 'bg-white' : 'bg-black'
                )}
                style={{height}}
              />
            )
          )
        }
      </button>
    </div>
  );
};

export default PttButton;
