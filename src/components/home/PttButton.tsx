import React, {useCallback, useEffect, useRef, type PointerEvent} from 'react';
import _ from 'lodash';
import useMicLevels, {unlockAudioContext} from '../../hooks/useMicLevels';
import useInterimLevels from '../../hooks/useInterimLevels';
import {cn} from '../../utils/cn';
import IconAlertBadge from '../../assets/icon-alert-badge.svg?react';

////////////////////////////////////////////////////////////////////////////////

const BAR_COUNT = 6;
const IDLE_BARS = [8, 16, 32, 12, 20, 8];

const ACTIVE_BAR_MIN_PX = 6;
const ACTIVE_BAR_MAX_PX = 32;

// Same as bar width — bars collapse to square dots while initializing.
const LOADER_DOT_PX = 2.5;

////////////////////////////////////////////////////////////////////////////////

export type PttState =
  | 'no-keys'
  | 'denied'
  | 'initializing'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking';

type Props = {
  state: PttState;
  stream?: MediaStream | null;
  interim?: string;
  isListening?: boolean;
  onPressStart?: () => void;
  onPressEnd?: () => void;
};

////////////////////////////////////////////////////////////////////////////////

const PttButton: React.FC<Props> = ({state, stream, interim, isListening, onPressStart, onPressEnd}) => {
  const realLevels = useMicLevels(stream ?? null, BAR_COUNT);
  const fallbackLevels = useInterimLevels(Boolean(isListening) && !stream, interim ?? '', BAR_COUNT);
  const levels = stream ? realLevels : fallbackLevels;

  const isListeningState = state === 'listening';
  const isInitializingState = state === 'initializing';
  const isInteractive = state !== 'no-keys' && state !== 'denied';

  // Cleanup fn for window-level release listeners installed on pointerdown.
  // Held in a ref so the first release wins — subsequent button or window
  // events become no-ops, preventing onPressEnd from firing twice.
  const teardownReleaseListenersRef = useRef<(() => void) | null>(null);

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const firePressEnd = useCallback(
    () => {
      const teardown = teardownReleaseListenersRef.current;
      if (!teardown) return;
      teardownReleaseListenersRef.current = null;
      teardown();
      onPressEnd?.();
    },
    [onPressEnd]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!isInteractive) return;
      event.preventDefault();
      // Lock subsequent pointer events to this button so the press state
      // releases reliably even if the finger drifts off on iOS.
      event.currentTarget.setPointerCapture(event.pointerId);
      // Resume the AudioContext synchronously inside this user gesture so the
      // analyser graph is 'running' by the time useMicLevels' effect attaches.
      unlockAudioContext();

      // Fallback release detection. Safari's mic permission prompt swallows
      // the captured pointer's release event on first grant, so the button
      // would otherwise stay visually pressed and listening would run forever.
      // window-level pointer/mouse/touch listeners catch a release that drifts
      // off-button; `blur` catches the modal case where no pointer event ever
      // reaches the page (system prompt closes → focus returns to page).
      const release = () => firePressEnd();
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      window.addEventListener('mouseup', release);
      window.addEventListener('touchend', release);
      window.addEventListener('blur', release);
      teardownReleaseListenersRef.current = () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        window.removeEventListener('mouseup', release);
        window.removeEventListener('touchend', release);
        window.removeEventListener('blur', release);
      };

      onPressStart?.();
    },
    [isInteractive, onPressStart, firePressEnd]
  );

  const handlePressEnd = useCallback(
    () => firePressEnd(),
    [firePressEnd]
  );

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Space hold = pointer hold; matches the "Hold Space to speak" hint.
  useEffect(
    () => {
      if (!isInteractive) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        if (event.repeat) return;
        unlockAudioContext();
        onPressStart?.();
      };

      const handleKeyUp = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        onPressEnd?.();
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    },
    [isInteractive, onPressStart, onPressEnd]
  );

  ////////////////////////////////////////////////////////////////////////////////

  const bars = isListeningState ?
    _.map(levels, level => ACTIVE_BAR_MIN_PX + level * (ACTIVE_BAR_MAX_PX - ACTIVE_BAR_MIN_PX))
    :
    IDLE_BARS;

  const isDisabled = state === 'no-keys' || state === 'denied';

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="relative w-[72px] h-[72px]">
      <div
        className={cn(
          'absolute inset-0 -m-8 rounded-full bg-[#FF5A7D]/10',
          'animate-halo-slow transition-opacity duration-300',
          isListeningState ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        className={cn(
          'absolute inset-0 -m-4 rounded-full bg-[#FF5A7D]/25',
          'animate-halo transition-opacity duration-300',
          isListeningState ? 'opacity-100' : 'opacity-0'
        )}
      />

      <button
        className={cn(
          'relative w-full h-full rounded-full border-2',
          'flex items-center justify-center gap-1',
          'select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]',
          'transition-[background-color,box-shadow,border-color] duration-300',
          isListeningState ?
            'bg-[#FF5A7D] border-transparent shadow-[0_0_0_8px_#FF5A7D]'
            :
            'bg-gradient-to-b from-white to-white/75 border-white shadow-[0_4px_16px_rgba(0,0,0,0.02)]',
          isDisabled && 'opacity-60',
          isInteractive ? 'cursor-pointer' : 'cursor-default'
        )}
        type="button"
        disabled={isDisabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePressEnd}
        onPointerCancel={handlePressEnd}
      >
        {
          _.map(
            bars,
            (idleHeight, index) => (
              <span
                key={index}
                className={cn(
                  'block w-[2.5px] rounded-full',
                  // Listening updates height every frame from FFT levels — a
                  // height transition would smear the visualizer. Outside of
                  // listening we transition height so the press → dots and
                  // listening → idle transitions read smoothly.
                  isListeningState ?
                    'bg-white transition-[background-color] duration-200'
                    :
                    'bg-black transition-[height,background-color] duration-300',
                  isInitializingState && 'loader-bar'
                )}
                style={{height: isInitializingState ? LOADER_DOT_PX : idleHeight}}
              />
            )
          )
        }
      </button>

      {
        state === 'denied' &&
        <IconAlertBadge
          className="absolute -top-1.5 -right-1.5 w-6 h-6 pointer-events-none"
          title="Microphone permission denied"
        />
      }
    </div>
  );
};

export default PttButton;
