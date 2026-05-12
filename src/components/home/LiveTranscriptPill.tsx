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

// One spoken word, wrapped in an inline-block span that fades in on mount.
// Stable index-based keys mean refinements to the trailing interim word
// just update text content (no flash); only genuinely new words remount
// and trigger the fade.
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

  // After every text update, schedule a RAF to measure the actual extent
  // of the rendered word spans inside the spacer — taking the union of
  // their bounding boxes gives us the text's tightest enclosing rect,
  // which respects `text-wrap: balance` (balanced lines use less than the
  // container's full max-w). Adding padding + border yields the target
  // bg/mask size. Measuring the wrapper itself would always give 340px
  // when wrapping happens, regardless of how balance distributed the
  // text. useEffect+RAF (not useLayoutEffect) so the previous bgSize
  // paints once before the new one — that gives the CSS transition a
  // from-value to animate.
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
          const rect = el.getBoundingClientRect();
          if (rect.left < minX) minX = rect.left;
          if (rect.right > maxX) maxX = rect.right;
          if (rect.top < minY) minY = rect.top;
          if (rect.bottom > maxY) maxY = rect.bottom;
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

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative mb-6 w-fit max-w-[340px] px-4 py-2',
        'text-sm text-center wrap-break-word',
        'transition-[filter,opacity] ease-out',
        visible ? 'opacity-100 blur-none duration-200' : 'opacity-0 blur-md duration-700 origin-bottom scale-75 -translate-y-3'
      )}
      style={{
        color: hintColor,
        textWrap: 'balance',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Invisible spacer — gives the wrapper its natural size so
        * `w-fit` / `max-w-[340px]` / `wrap-break-word` resolve against this
        * content. The visible text inside the mask below mirrors this
        * layout exactly, so character positions match. */}
      <div aria-hidden className="invisible">
        {
          _.map(
            words,
            (word, index) => (
              <React.Fragment key={`spacer-${index}`}>
                {index > 0 ? ' ' : null}
                <span className="inline-block" data-pill-word>{word}</span>
              </React.Fragment>
            )
          )
        }
      </div>

      {/* Background pill — animates its own width/height to the wrapper's
        * natural size. Centered via top/left + translate so it grows
        * outward from the middle. */}
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'rounded-3xl border-[0.5px]',
          'backdrop-blur-md bg-linear-to-b from-black/10 to-black/5 bg-blend-lighten',
          'transition-[width,height] duration-200 ease-out'
        )}
        style={{
          width: `${bgSize.width}px`,
          height: `${bgSize.height}px`,
          // Border inherits the variant's hint color at low alpha so it
          // stays readable on both light and dark variant backgrounds.
          borderColor: 'color-mix(in srgb, currentColor 12%, transparent)',
        }}
      />

      {/* Mask — twin of the bg with the same animated size and rounded
        * shape, used purely to clip the visible text to the pill's
        * current outline. The text inside keeps its natural layout (same
        * styles as the spacer above), so the mask hides parts of it
        * without ever resizing it. */}
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
