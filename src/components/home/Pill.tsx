import type {ReactNode, ButtonHTMLAttributes} from 'react';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

const Pill = ({className, type = 'button', onClick, children, ...rest}: Props) => (
  <button
    className={cn(
      'bg-gradient-to-b from-white to-white/75 border-2 border-white rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.02)]',
      onClick && 'cursor-pointer',
      className
    )}
    type={type}
    onClick={onClick}
    {...rest}
  >
    {children}
  </button>
);

export default Pill;
