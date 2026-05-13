import type {ReactNode, ButtonHTMLAttributes} from 'react';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

// The fill is a separate absolutely-positioned layer so its `inset` can
// animate independently — that's how the underlay expands outward on
// hover and press without affecting the button's outer footprint.
// `isolate` + `-z-10` on the fill puts it behind the in-flow children
// without an extra wrapping span. Variants (e.g. pink-when-muted) are
// applied by consumers with `[&_[data-pill-fill]]:…` overrides targeting
// this same div, so the swap never changes the DOM and the CSS
// transition runs continuously through the variant change.
const Pill = ({className, type = 'button', onClick, children, ...rest}: Props) => (
  <button
    className={cn(
      'relative isolate rounded-full select-none',
      onClick && 'group cursor-pointer',
      className
    )}
    type={type}
    onClick={onClick}
    {...rest}
  >
    <span
      data-pill-fill
      className={cn(
        'absolute inset-0 -z-10 rounded-full border-2 border-white',
        'bg-gradient-to-b from-white to-white/75',
        'shadow-[0_4px_16px_rgba(0,0,0,0.02)]',
        // Scale (compositor-only) instead of inset (per-frame reflow) so
        // the hover/press feedback stays smooth. Scale values calibrated
        // for the 48px Header pills: +2px each side ≈ 1.083, +4px ≈ 1.167.
        'transition-all duration-300 ease-out',
        onClick && [
          'group-hover:scale-[1.083] group-hover:to-white group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]',
          'group-active:scale-[1.167] group-active:to-white group-active:shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
        ]
      )}
    />
    {children}
  </button>
);

export default Pill;
