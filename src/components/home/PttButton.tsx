import {useCallback, useEffect, useState, type PointerEvent} from 'react';
import _ from 'lodash';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

const IDLE_BARS = [8, 16, 32, 12, 20, 8];

const ACTIVE_BAR_MIN = 6;
const ACTIVE_BAR_MAX = 32;
const ACTIVE_TICK_MS = 120;

const randomBars = () => _.times(6, () => Math.round(ACTIVE_BAR_MIN + Math.random() * (ACTIVE_BAR_MAX - ACTIVE_BAR_MIN)));

////////////////////////////////////////////////////////////////////////////////

const PttButton = () => {
  const [isPressed, setIsPressed] = useState(false);
  const [bars, setBars] = useState<number[]>(IDLE_BARS);

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
      setIsPressed(true);
    },
    []
  );

  const handlePressEnd = useCallback(
    () => setIsPressed(false),
    []
  );

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Drive the bar heights while pressed. Random for now — swap to mic
  // FFT amplitudes in a follow-up.
  useEffect(
    () => {
      if (!isPressed) {
        setBars(IDLE_BARS);
        return;
      }
      setBars(randomBars());
      const interval = setInterval(() => setBars(randomBars()), ACTIVE_TICK_MS);
      return () => clearInterval(interval);
    },
    [isPressed]
  );

  // Space hold = pointer hold; matches the "Hold Space to speak" hint.
  useEffect(
    () => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        if (event.repeat) return;
        setIsPressed(true);
      };
      const handleKeyUp = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        setIsPressed(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    },
    []
  );

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
                  'transition-[height,background-color] duration-200',
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
