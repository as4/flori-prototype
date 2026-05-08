import React from 'react';
import PttButton, {type PttState} from './PttButton';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  hintColor: string;
  pttState: PttState;
  stream?: MediaStream | null;
  interim?: string;
  isListening?: boolean;
  onPressStart?: () => void;
  onPressEnd?: () => void;
};

////////////////////////////////////////////////////////////////////////////////

const Footer: React.FC<Props> = ({
  hintColor,
  pttState,
  stream,
  interim,
  isListening,
  onPressStart,
  onPressEnd,
}) => {
  const hint =
    pttState === 'no-keys' ? 'Enter access code in settings' :
    pttState === 'denied' ? 'Allow mic to speak' :
    null;

  return (
    <footer className="absolute right-0 bottom-6 sm:bottom-12 left-0 z-10 flex flex-col items-center gap-4">
      <PttButton
        state={pttState}
        stream={stream}
        interim={interim}
        isListening={isListening}
        onPressStart={onPressStart}
        onPressEnd={onPressEnd}
      />
      <div
        className="text-sm leading-5 text-center select-none"
        style={{color: hintColor}}
      >
        {hint ?? <>Hold <span className="hidden sm:inline">Space </span>to speak</>}
      </div>
    </footer>
  );
};

export default Footer;
