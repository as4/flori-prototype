import { useEffect } from 'react';

////////////////////////////////////////////////////////////////////////////////

type PushToTalkState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'disabled';

interface PushToTalkButtonProps {
  className?: string;
  state: PushToTalkState;
  interim?: string;
  onPressStart: () => void;
  onPressEnd: () => void;
}

const LABELS: Record<PushToTalkState, string> = {
  idle: 'Hold to talk',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  disabled: 'Connect first',
};

////////////////////////////////////////////////////////////////////////////////

const PushToTalkButton = ({
  className,
  state,
  interim,
  onPressStart,
  onPressEnd,
}: PushToTalkButtonProps) => {
  const disabled = state === 'disabled';

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  useEffect(
    () => {
      if (disabled) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space' || event.repeat) return;
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        onPressStart();
      };
      const handleKeyUp = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        onPressEnd();
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    },
    [disabled, onPressStart, onPressEnd]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className={`ptt-wrapper ${className ?? ''}`}>
      <button
        className={`ptt-button ptt-${state}`}
        type="button"
        disabled={disabled}
        onPointerDown={event => {
          event.preventDefault();
          onPressStart();
        }}
        onPointerUp={onPressEnd}
        onPointerLeave={onPressEnd}
        onPointerCancel={onPressEnd}
      >
        <span className="ptt-icon" aria-hidden="true">🎤</span>
      </button>
      <div className="ptt-label">{LABELS[state]}</div>
      {
        interim &&
        <div className="ptt-interim">"{interim}"</div>
      }
      <div className="ptt-hint">or hold Space</div>
    </div>
  );
};

export default PushToTalkButton;
