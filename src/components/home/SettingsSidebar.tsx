import React, {useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type TouchEvent, type UIEvent} from 'react';
import _ from 'lodash';
import SecretInput from './SecretInput';
import {cn} from '../../utils/cn';
import {getLogs, subscribeLogs, type DebugEntry} from '../../utils/log';
import IconCloseSidebar from '../../assets/icon-close-sidebar.svg?react';

////////////////////////////////////////////////////////////////////////////////

const COPY_FEEDBACK_MS = 1500;
const STICKY_BOTTOM_THRESHOLD_PX = 40;
const SWIPE_CLOSE_THRESHOLD_PX = 80;

////////////////////////////////////////////////////////////////////////////////

export type UnlockResult = {ok: true} | {ok: false; error: string};

export type TranscriptTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type SttLanguageOption = {
  id: string;
  label: string;
};

type Props = {
  open: boolean;
  unlocked: boolean;
  isConnected?: boolean;
  transcript?: TranscriptTurn[];
  sttLanguages?: ReadonlyArray<SttLanguageOption>;
  sttLanguage?: string;
  ttftMs?: number | null;
  ttfaMs?: number | null;
  onClose?: () => void;
  onUnlock?: (password: string) => Promise<UnlockResult>;
  onDisconnect?: () => void;
  onSttLanguageChange?: (id: string) => void;
  // Fired during a swipe-to-close drag with the current rightward offset
  // (0 on touchend / release) so the parent can move the stage in lockstep.
  onSwipeOffset?: (dx: number) => void;
};

////////////////////////////////////////////////////////////////////////////////

const formatLatency = (ms: number | null | undefined) =>
  typeof ms === 'number' ? `${ms}ms` : '—';

const formatTime = (timestamp: number) => new Date(timestamp).toISOString().slice(11, 23);

const formatLogEntries = (entries: DebugEntry[]) => _.map(
  entries,
  entry => {
    const data = entry.data === undefined ?
      ''
      :
      ` ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}`;
    return `${formatTime(entry.time)} ${entry.message}${data}`;
  }
).join('\n');

////////////////////////////////////////////////////////////////////////////////

// Keeps a scroll container pinned to the bottom while the user is already
// near the bottom; lets them scroll up to read older content without
// fighting the auto-scroll. Keyed on `dependency` so each new entry that
// arrives triggers the check.
const useStickyBottomScroll = <T,>(dependency: T) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const {scrollTop, scrollHeight, clientHeight} = event.currentTarget;
    stickyRef.current = scrollHeight - scrollTop - clientHeight < STICKY_BOTTOM_THRESHOLD_PX;
  };

  useEffect(
    () => {
      const container = containerRef.current;
      if (container && stickyRef.current) container.scrollTop = container.scrollHeight;
    },
    [dependency]
  );

  return {containerRef, handleScroll};
};

////////////////////////////////////////////////////////////////////////////////

const ConversationLog: React.FC<{turns: TranscriptTurn[]}> = ({turns}) => {
  const {containerRef, handleScroll} = useStickyBottomScroll(turns.length);

  if (turns.length === 0) {
    return (
      <p className="text-sm text-white/[0.48]">No turns yet — press and hold to talk.</p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-h-[240px] py-5 pr-2 overflow-y-auto flex flex-col gap-3 fade-edges-y"
      onScroll={handleScroll}
    >
      {
        _.map(
          turns,
          (turn, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/[0.48]">
                {turn.role === 'user' ? 'You' : 'Flori'}
              </span>
              <span className="text-sm text-white whitespace-pre-wrap">{turn.text}</span>
            </div>
          )
        )
      }
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////

const DebugLog: React.FC = () => {
  const logs = useSyncExternalStore(subscribeLogs, getLogs);
  const {containerRef, handleScroll} = useStickyBottomScroll(logs.length);

  return (
    <div
      ref={containerRef}
      className="w-full max-h-[240px] py-5 pr-2 overflow-y-auto flex flex-col gap-1 font-mono text-xs fade-edges-y"
      onScroll={handleScroll}
    >
      {
        logs.length === 0 ?
          <span className="text-white/[0.48]">Waiting for events...</span>
          :
          _.map(
            logs,
            (entry, index) => (
              <div key={index} className="flex gap-2 items-baseline">
                <span className="shrink-0 text-white/[0.48]">{formatTime(entry.time)}</span>
                <span className="text-white/[0.72]">{entry.message}</span>
                {
                  entry.data !== undefined &&
                  <span className="text-[#FF5A7D]/[0.72] break-all">
                    {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
                  </span>
                }
              </div>
            )
          )
      }
    </div>
  );
};

////////////////////////////////////////////////////////////////////////////////

const SectionTitle: React.FC<{children: React.ReactNode}> = ({children}) => (
  <h3 className="text-base font-semibold text-white">{children}</h3>
);

////////////////////////////////////////////////////////////////////////////////

const SettingsSidebar: React.FC<Props> = ({
  open,
  unlocked,
  isConnected,
  transcript,
  sttLanguages,
  sttLanguage,
  ttftMs,
  ttfaMs,
  onClose,
  onUnlock,
  onDisconnect,
  onSttLanguageChange,
  onSwipeOffset,
}) => {
  const passwordId = useId();

  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);

  const unlockActive = !unlocked && password.length > 0 && !unlocking;
  const showLatency = ttftMs != null || ttfaMs != null;
  // Heavy children (subscribed log feed, transcript scroll container) are
  // gated on `open && unlocked` so they don't re-render while the user is
  // mid-conversation with the drawer closed.
  const showHeavySections = open && unlocked;

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleUnlock = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!unlockActive || !onUnlock) return;

    setUnlocking(true);
    setUnlockError(null);

    const result = await onUnlock(password);

    setUnlocking(false);

    if (result.ok) {
      setPassword('');
      onClose?.();
    } else {
      setUnlockError(result.error);
    }
  };

  // iOS-style swipe-right-to-close. The drawer follows the finger live
  // while dragging horizontally, then snaps closed if released past the
  // threshold or snaps back otherwise. We commit to "horizontal" only
  // once movement clearly exceeds the vertical axis so internal scrolling
  // (conversation / debug logs) isn't hijacked. `touch-pan-y` on the
  // aside lets the browser handle vertical scroll natively while we own
  // the horizontal axis.
  const asideRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    direction: 'horizontal' | 'vertical' | null;
    lastDx: number;
  } | null>(null);

  const handleTouchStart = (event: TouchEvent) => {
    if (!open || event.touches.length !== 1) return;
    dragRef.current = {
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      direction: null,
      lastDx: 0,
    };
  };

  // Stable ref for the callback so the touchmove listener (attached once
  // via useEffect) always sees the latest function without re-attaching.
  const onSwipeOffsetRef = useRef(onSwipeOffset);
  onSwipeOffsetRef.current = onSwipeOffset;

  // Touchmove must call preventDefault() once we commit to a horizontal
  // swipe so the browser doesn't simultaneously scroll the inner content.
  // React's onTouchMove is passive by default and can't preventDefault,
  // so we attach the listener manually with `passive: false`.
  useEffect(
    () => {
      const aside = asideRef.current;
      if (!aside) return;

      const handler = (event: globalThis.TouchEvent) => {
        const drag = dragRef.current;
        if (!drag) return;

        const dx = event.touches[0].clientX - drag.startX;
        const dy = event.touches[0].clientY - drag.startY;

        if (drag.direction === null) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          drag.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }

        if (drag.direction !== 'horizontal') return;

        event.preventDefault();

        drag.lastDx = Math.max(0, dx);
        aside.style.transition = 'none';
        // Tailwind v4's translate-x utilities write to the `translate`
        // property; override the same property so they don't stack.
        aside.style.translate = `${drag.lastDx}px 0`;
        onSwipeOffsetRef.current?.(drag.lastDx);
      };

      aside.addEventListener('touchmove', handler, {passive: false});
      return () => aside.removeEventListener('touchmove', handler);
    },
    []
  );

  const handleTouchEnd = (event: TouchEvent) => {
    const drag = dragRef.current;
    const aside = asideRef.current;
    dragRef.current = null;

    if (!drag || drag.direction !== 'horizontal' || !aside) return;

    // Clear inline overrides so the Tailwind transition class takes over
    // and the drawer animates to its final state (closed or snap back).
    aside.style.translate = '';
    aside.style.transition = '';
    onSwipeOffset?.(0);

    const touch = event.changedTouches[0];
    const dx = touch ? touch.clientX - drag.startX : drag.lastDx;

    if (dx > SWIPE_CLOSE_THRESHOLD_PX) {
      onClose?.();
    }
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(formatLogEntries(getLogs()));
      setLogsCopied(true);
      window.setTimeout(() => setLogsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard write rejected (e.g. iOS in non-secure context). Silent
      // fail — the user will know nothing changed.
    }
  };

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <aside
      ref={asideRef}
      className={cn(
        // Width caps at 400px but shrinks to fit narrow phones (where 400
        // would overflow the viewport).
        'fixed top-0 right-0 h-full w-[min(100vw,400px)] z-[20] overflow-hidden',
        // touch-pan-y lets the browser handle vertical scroll natively
        // (so internal scrollers keep working) while leaving the
        // horizontal axis to our swipe-to-close handler.
        'touch-pan-y',
        // Mobile: round the sidebar's left corners to match the desktop
        // overlay frame's radius. Desktop has a separate rounded window in
        // the stage area, so we cancel the rounding at `sm:` and up.
        'rounded-l-[40px] sm:rounded-l-none',
        'bg-[#291C29]',
        'transition-transform duration-300 ease-out',
        open ? 'translate-x-0' : 'translate-x-full',
        !open && 'pointer-events-none'
      )}
      aria-hidden={!open}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Inner scroll container — owns the padding so absolutely-positioned
        * siblings (the chevron) stay anchored to the aside and don't
        * scroll with content. Mobile halves the top/right padding (48 →
        * 24) so the form has more breathing room near the close handle.
        */}
      <div className="absolute inset-0 overflow-y-auto p-12 max-sm:pt-6 max-sm:pr-6 flex flex-col items-start gap-8">
      {
        !unlocked &&
        <form
          className="w-full flex flex-col items-start gap-4"
          onSubmit={handleUnlock}
        >
          <label
            className="text-base font-semibold text-white"
            htmlFor={passwordId}
          >
            Access code
          </label>
          <SecretInput
            id={passwordId}
            placeholder="Enter access code..."
            value={password}
            onChange={setPassword}
          />
          {
            unlockError &&
            <p className="text-sm text-[#FF5A7D]">{unlockError}</p>
          }
          <button
            className={cn(
              'px-6 py-3 rounded-full',
              'bg-[#FF5A7D] text-base font-semibold text-white',
              'transition-opacity duration-150',
              unlockActive ? 'opacity-100 cursor-pointer' : 'opacity-[0.48] cursor-default'
            )}
            type="submit"
            disabled={!unlockActive}
          >
            {unlocking ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      }

      {
        unlocked && isConnected &&
        <button
          className={cn(
            'px-6 py-3 rounded-full border-2 border-[#FF5A7D]',
            'text-base font-semibold text-white',
            'cursor-pointer'
          )}
          type="button"
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      }

      {
        unlocked && sttLanguages && sttLanguage &&
        <div className="w-full flex flex-col gap-3">
          <SectionTitle>Speech recognition</SectionTitle>
          <div className="flex gap-2">
            {
              _.map(
                sttLanguages,
                language => (
                  <button
                    key={language.id}
                    className={cn(
                      'px-4 py-2 rounded-full border',
                      'text-sm font-semibold',
                      'cursor-pointer transition-colors duration-150',
                      sttLanguage === language.id ?
                        'border-[#FF5A7D] bg-[#FF5A7D]/[0.16] text-white'
                        :
                        'border-white/[0.16] text-white/[0.72]'
                    )}
                    type="button"
                    onClick={() => onSttLanguageChange?.(language.id)}
                  >
                    {language.label}
                  </button>
                )
              )
            }
          </div>
        </div>
      }

      {
        showHeavySections &&
        <div className="w-full flex flex-col gap-3">
          <SectionTitle>Conversation</SectionTitle>
          <ConversationLog turns={transcript ?? []}/>
        </div>
      }

      {
        showHeavySections &&
        <div className="w-full flex flex-col gap-3">
          <SectionTitle>Debug</SectionTitle>
          <DebugLog/>
        </div>
      }

      <div className="mt-auto w-full flex flex-col items-start gap-3">
        <button
          className={cn(
            'px-4 py-2 rounded-full border border-white/[0.16]',
            'text-sm font-semibold text-white/[0.72]',
            'cursor-pointer'
          )}
          type="button"
          onClick={handleCopyLogs}
        >
          {logsCopied ? 'Copied!' : 'Copy logs'}
        </button>

        {
          showLatency &&
          <p className="text-sm font-mono text-white/[0.48]">
            TTFT {formatLatency(ttftMs)} • TTFA {formatLatency(ttfaMs)}
          </p>
        }
      </div>
      </div>

      {/* Mobile close handle — anchored to the aside (not the scroll
        * container) so it stays put while content scrolls underneath.
        */}
      <button
        className="absolute top-1/2 -translate-y-1/2 left-2 w-8 h-12 flex items-center justify-center cursor-pointer text-white sm:hidden"
        type="button"
        aria-label="Close settings"
        onClick={onClose}
      >
        <IconCloseSidebar className="w-4 h-4 [&_path]:stroke-white"/>
      </button>
    </aside>
  );
};

export default SettingsSidebar;
