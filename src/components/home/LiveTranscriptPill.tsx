import _ from 'lodash';
import React, {type TransitionEvent, useEffect, useRef, useState} from 'react';
import {cn} from '../../utils/cn';

////////////////////////////////////////////////////////////////////////////////

type Props = {
  hintColor: string;
  text?: string;
  isListening?: boolean;
};

////////////////////////////////////////////////////////////////////////////////

// One spoken word, wrapped in an inline-block span that fades in and
// scales up on mount. Stable index-based keys mean refinements to the
// trailing interim word just update text content (no flash); only
// genuinely new words remount and trigger the animation.
const Word: React.FC<{children: string}> = ({children}) => {
  const [appeared, setAppeared] = useState(false);

  useEffect(
    () => {
      const id = requestAnimationFrame(() => setAppeared(true));
      return () => cancelAnimationFrame(id);
    },
    []
  );

  return (
    <span
      data-pill-word
      className={cn(
        'inline-block origin-left transition-[scale,opacity] duration-500 ease-out delay-150',
        appeared ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      )}
    >
      {children}
    </span>
  );
};

////////////////////////////////////////////////////////////////////////////////

const LiveTranscriptPill: React.FC<Props> = ({hintColor, text, isListening}) => {
  const [displayText, setDisplayText] = useState('');
  const [visible, setVisible] = useState(false);
  const [bgSize, setBgSize] = useState<{width: number; height: number}>({width: 0, height: 0});

  const wrapperRef = useRef<HTMLDivElement>(null);

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  // Only react to the wrapper's own opacity transition — Word children
  // bubble transitionend for their fade-in opacity, and the bg/mask divs
  // bubble their width/height transitions. event.target === currentTarget
  // narrows it to the wrapper itself.
  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName === 'opacity' && !visible) {
      setDisplayText('');
      setBgSize({width: 0, height: 0});
    }
  };

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  useEffect(
    () => {
      if (isListening) {
        if (text) {
          setDisplayText(text);
          setVisible(true);
        }

        return;
      }

      // STT just ended (recognition fired onend → handleSttFinal is now
      // dispatching to the LLM). Keep the last text on screen but start
      // the fade. transitionEnd clears displayText below.
      setVisible(false);
    },
    [isListening, text]
  );

  // After every text update, schedule a RAF to measure the tightest
  // enclosing rect of the visible word spans. Using `offsetLeft` /
  // `offsetWidth` instead of `getBoundingClientRect` ignores the
  // `scale-90 → scale-100` transform on each Word, so the measurement is
  // accurate even mid-animation — which lets us skip the invisible
  // spacer entirely. Plus padding + border gives the bg/mask target
  // size, and the wrapper's inline width/height follow the same value so
  // the Footer reserves the right space.
  useEffect(
    () => {
      const id = requestAnimationFrame(() => {
        if (!wrapperRef.current) return;

        const wordEls = wrapperRef.current.querySelectorAll<HTMLElement>('[data-pill-word]');
        if (wordEls.length === 0) return;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        wordEls.forEach(el => {
          const left = el.offsetLeft;
          const top = el.offsetTop;
          const right = left + el.offsetWidth;
          const bottom = top + el.offsetHeight;
          if (left < minX) minX = left;
          if (right > maxX) maxX = right;
          if (top < minY) minY = top;
          if (bottom > maxY) maxY = bottom;
        });

        // px-4 py-2 → 16px horizontal + 8px vertical on each side. The
        // 0.5px border on the bg adds ~1px total in each dimension.
        const PADDING_X = 32;
        const PADDING_Y = 16;
        const BORDER = 1;

        setBgSize({
          width: maxX - minX + PADDING_X + BORDER,
          height: maxY - minY + PADDING_Y + BORDER,
        });
      });
      return () => cancelAnimationFrame(id);
    },
    [displayText]
  );

  ////////////////////////////////////////////////////////////////////////////////

  if (!displayText) return null;

  const words = _.compact(_.split(displayText, /\s+/));

  // hintColor is dark (rgba(0,0,0,...)) on light variants and light
  // (rgba(255,255,255,...)) on the green variant; we use it as the signal
  // for which way to bias the pill so contrast holds across all variants.
  const isDarkHint = /rgba?\(\s*0\s*,\s*0\s*,\s*0/.test(hintColor);
  // Pill text uses a stronger alpha than the hint label below — the
  // surrounding pill bg cuts a bit of contrast, so the text needs more
  // weight than the subtle "Hold to speak" hint.
  const textColor = isDarkHint ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.96)';

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative mb-6',
        'transition-[filter,opacity,scale,translate] ease-out',
        visible ? 'opacity-100 blur-none duration-200' : 'opacity-0 blur-md duration-300 ease-in origin-bottom scale-75 -translate-y-7.5'
      )}
      style={{
        width: `${bgSize.width}px`,
        height: `${bgSize.height}px`,
        color: textColor,
        textWrap: 'balance',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Background pill — animates its own width/height to match the
        * wrapper. Centered via top/left + translate so it grows outward
        * from the middle. Color choice is driven by the hint: dark pill
        * for light variants, light pill for the green variant. */}
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'rounded-3xl',
          'backdrop-blur-md',
          'transition-[width,height] duration-200 ease-out',
          isDarkHint ? 'bg-linear-to-b from-white/70 to-white/50 border-white border-t border-l' : 'bg-white/15 border-white/20 border-r border-t'
        )}
        style={{
          width: `${bgSize.width}px`,
          height: `${bgSize.height}px`,
        }}
      />

      {/* Mask — same animated size and rounded shape as the bg, clips the
        * visible text to the pill's current outline. The text inside
        * keeps its natural layout (its own `w-max max-w-[340px]`), so the
        * mask hides parts of it without ever resizing it. */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'rounded-3xl overflow-hidden',
          'transition-[width,height] duration-200 ease-out'
        )}
        style={{
          width: `${bgSize.width}px`,
          height: `${bgSize.height}px`,
        }}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-[340px] px-4 py-2 text-sm text-center wrap-break-word"
          style={{textWrap: 'balance'}}
        >
          {
            _.map(
              words,
              (word, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? ' ' : null}
                  <Word>{word}</Word>
                </React.Fragment>
              )
            )
          }
        </div>
      </div>
    </div>
  );
};

export default LiveTranscriptPill;
