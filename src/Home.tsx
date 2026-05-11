import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import _ from 'lodash';
import {scramble} from './api/scramble';
import {unlockKeys} from './api/unlock';
import Background, {pickBgVariant} from './components/home/Background';
import Footer from './components/home/Footer';
import Header from './components/home/Header';
import type {PttState} from './components/home/PttButton';
import SettingsSidebar, {type TranscriptTurn, type UnlockResult} from './components/home/SettingsSidebar';
import RiveCharacter, {type RiveCharacterHandle} from './components/RiveCharacter';
import {IDLE_GESTURE_DELAY_MAX_MS, IDLE_GESTURE_DELAY_MIN_MS, IDLE_GESTURE_FIRST_DELAY_MAX_MS, IDLE_GESTURE_FIRST_DELAY_MIN_MS, IDLE_GESTURE_TRIGGERS, type RiveTriggerName} from './config';
import type {EmotionName} from './emotions';
import {DEFAULT_EMOTION_PROMPT, DEFAULT_SYSTEM_PROMPT, HOME_LLM_MODEL, HOME_TTS_MODEL, HOME_TTS_VOICE,} from './home-config';
import useEmotionQueue from './hooks/useEmotionQueue';
import useInworldTTS from './hooks/useInworldTTS';
import useLLMChat from './hooks/useLLMChat';
import useLocalStorage from './hooks/useLocalStorage';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import {createGoogleAdapter} from './llm/google/adapter';
import {cn} from './utils/cn';
import {log} from './utils/log';
import './Home.css';

////////////////////////////////////////////////////////////////////////////////

const SYSTEM_PROMPT = `${DEFAULT_SYSTEM_PROMPT}\n\n${DEFAULT_EMOTION_PROMPT}`;
const MIC_DENIED_PATTERN = /denied|not-allowed|service-not-allowed|service permission/i;

////////////////////////////////////////////////////////////////////////////////

const Home = () => {
  const variant = useMemo(pickBgVariant, []);

  // Password persists across reloads; the actual TTS/LLM keys live only in
  // memory, fetched via the password on mount.
  const [storedPassword, setStoredPassword] = useLocalStorage('flori-password');
  const [apiKey, setApiKey] = useState('');
  const [llmKey, setLlmKey] = useState('');

  const [characterReady, setCharacterReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [pttPressed, setPttPressed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ttftMs, setTtftMs] = useState<number | null>(null);
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);

  const turnStartTimeRef = useRef<number | null>(null);
  const ttftLoggedRef = useRef(false);
  const isListeningRef = useRef(false);
  const wasSpeakingRef = useRef(false);
  const pttPressStartRef = useRef<number | null>(null);
  const homeRef = useRef<HTMLDivElement | null>(null);
  const riveRef = useRef<RiveCharacterHandle>(null);
  // Tracks the last idle gesture so the picker can avoid back-to-back
  // excited_* picks (they read as the same animation playing twice). Survives
  // idle exit/re-entry — the rule is global, not per idle stretch.
  const lastIdleGestureRef = useRef<RiveTriggerName | null>(null);

  const adapter = useMemo(
    () => createGoogleAdapter(llmKey, HOME_LLM_MODEL),
    [llmKey]
  );

  //--------------------------------------------------------------------------
  //
  //  Hooks pipeline (callbacks feed into the hooks below them)
  //
  //--------------------------------------------------------------------------

  const {
    currentEmotion,
    setCurrentEmotion,
    enqueue: enqueueEmotion,
    reset: resetEmotionQueue,
    onSegmentStart,
  } = useEmotionQueue({enabled: true});

  const {
    status: ttsStatus,
    currentViseme,
    connect,
    beginTurn,
    streamSentence,
    disconnect,
    ensureAudioReady,
  } = useInworldTTS({
    apiKey,
    voiceId: HOME_TTS_VOICE,
    modelId: HOME_TTS_MODEL,
    muted,
    onSegmentStart,
  });

  const isConnected = ttsStatus === 'connected' || ttsStatus === 'speaking';

  const handleSentence = useCallback(
    (sentence: string, emotion?: EmotionName) => {
      if (isListeningRef.current) return;

      if (!isConnected) {
        log('Not connected — skipping sentence');
        return;
      }

      enqueueEmotion(emotion);
      log('Sentence → TTS', sentence);
      streamSentence(sentence);
    },
    [isConnected, streamSentence, enqueueEmotion]
  );

  const handleChatDone = useCallback(
    (fullText: string, rawText: string) => {
      const reply = fullText.trim();
      if (!reply) return;

      const rawReply = rawText.trim() || reply;
      setTranscript(previous => [...previous, {role: 'assistant', text: rawReply}]);
      log('LLM reply', rawReply);
    },
    []
  );

  const handleChatError = useCallback(
    (message: string) => {
      log('LLM error', message);
    },
    []
  );

  const handleToken = useCallback(
    () => {
      if (ttftLoggedRef.current || turnStartTimeRef.current === null) return;
      const delta = Date.now() - turnStartTimeRef.current;
      setTtftMs(delta);
      ttftLoggedRef.current = true;
      log('TTFT', `${delta}ms`);
    },
    []
  );

  const {send: sendToChat, isStreaming, cancel: cancelLLM} = useLLMChat({
    adapter,
    systemPrompt: SYSTEM_PROMPT,
    onToken: handleToken,
    onSentence: handleSentence,
    onDone: handleChatDone,
    onError: handleChatError,
  });

  // Layer LLM-streaming on top of TTS status: while the LLM is still emitting
  // tokens (or sentences are queued in InWorld) but no audio is playing yet,
  // the user should see "processing".
  const status =
    ttsStatus === 'speaking' ? 'speaking' :
      ttsStatus === 'connected' && isStreaming ? 'processing' :
        ttsStatus;

  const handleSttFinal = useCallback(
    (sttTranscript: string) => {
      log('Heard', sttTranscript);
      log('Sending to LLM');
      setTranscript(previous => [...previous, {role: 'user', text: sttTranscript}]);
      turnStartTimeRef.current = Date.now();
      ttftLoggedRef.current = false;
      setTtftMs(null);
      setTtfaMs(null);
      resetEmotionQueue();
      beginTurn();
      sendToChat(sttTranscript);
    },
    [sendToChat, beginTurn, resetEmotionQueue]
  );

  const handleSttError = useCallback(
    (message: string) => {
      log('Speech recognition error', message);
      if (MIC_DENIED_PATTERN.test(message)) {
        setMicDenied(true);
      }
    },
    []
  );

  const {
    isListening,
    interim,
    stream,
    start: startListening,
    stop: stopListening,
    cancel: cancelListening,
  } = useSpeechRecognition({
    onFinal: handleSttFinal,
    onError: handleSttError,
  });

  if (isListening && !isListeningRef.current && pttPressStartRef.current !== null) {
    log('PTT listening activated', {elapsed: `${(performance.now() - pttPressStartRef.current).toFixed(0)}ms`});
    pttPressStartRef.current = null;
  }

  isListeningRef.current = isListening;

  ////////////////////////////////////////////////////////////////////////////////

  const hasKeys = Boolean(apiKey) && Boolean(llmKey);

  // Order matters: listening wins over initializing because the user is
  // actively talking (their voice is being captured) — they need the bar
  // animation as feedback, not the connect pulse. While the user is pressing
  // but isListening hasn't flipped yet (STT/TTS still setting up over the
  // network — 1-2s even with pre-granted mic), the button shows the
  // initializing pulse so the press feels acknowledged.
  const pttState: PttState =
    !hasKeys ? 'no-keys' :
      micDenied ? 'denied' :
        isListening ? 'listening' :
          pttPressed ? 'initializing' :
            isStreaming ? 'thinking' :
              (status === 'speaking' || status === 'processing') ? 'speaking' :
                ttsStatus === 'connecting' ? 'initializing' :
                  'idle';

  //--------------------------------------------------------------------------
  //
  //  Helpers
  //
  //--------------------------------------------------------------------------

  const handleCharacterReady = useCallback(
    () => setCharacterReady(true),
    []
  );

  const toggleSettings = useCallback(
    () => setSettingsOpen(open => !open),
    []
  );

  const closeSettings = useCallback(
    () => setSettingsOpen(false),
    []
  );

  const toggleMute = useCallback(
    () => setMuted(prev => !prev),
    []
  );

  // Move the stage in lockstep with the sidebar during a swipe-to-close
  // drag so the two feel like one continuous panel. Mobile only: on `sm:`
  // and above, the stage doesn't translate at all (the frame overlay
  // handles the open/close visual), so dragging it would look wrong.
  const handleSidebarSwipe = useCallback(
    (dx: number) => {
      const home = homeRef.current;
      if (!home) return;

      const isMobile = window.matchMedia('(max-width: 639px)').matches;
      if (!isMobile) return;

      if (dx === 0) {
        home.style.transition = '';
        home.style.translate = '';
        return;
      }

      const shift = Math.min(window.innerWidth, 400);
      home.style.transition = 'none';
      // Tailwind v4's `-translate-x-*` writes to the `translate` CSS
      // property, not `transform`. Override the same property so they
      // don't stack.
      home.style.translate = `${dx - shift}px 0`;
    },
    []
  );

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handlePttStart = useCallback(
    () => {
      if (pttState === 'no-keys' || pttState === 'denied') return;
      const pressStart = performance.now();
      pttPressStartRef.current = pressStart;
      log('PTT press');
      setPttPressed(true);
      // Cancel any in-flight LLM/TTS turn so barge-in is clean.
      cancelLLM();
      beginTurn();
      resetEmotionQueue();
      ensureAudioReady();
      log('PTT ensureAudioReady done', {elapsed: `${(performance.now() - pressStart).toFixed(0)}ms`});

      // Auto-connect on first press. fire-and-forget; useInworldTTS owns the
      // socket lifecycle.
      // Auto-connect on first press. fire-and-forget; useInworldTTS owns the
      // socket lifecycle.
      if (ttsStatus === 'disconnected' || ttsStatus === 'error') {
        connect();
      }

      startListening();
      log('PTT startListening returned', {elapsed: `${(performance.now() - pressStart).toFixed(0)}ms`});
    },
    [
      pttState,
      cancelLLM,
      beginTurn,
      resetEmotionQueue,
      ensureAudioReady,
      ttsStatus,
      connect,
      startListening,
    ]
  );

  const handlePttEnd = useCallback(
    () => {
      setPttPressed(false);
      stopListening();
    },
    [stopListening]
  );

  const handleUnlock = useCallback(
    async (password: string): Promise<UnlockResult> => {
      const scrambled = scramble(password);
      const result = await unlockKeys(scrambled);

      if (result.ok) {
        setApiKey(result.ttsKey);
        setLlmKey(result.llmKey);
        setStoredPassword(scrambled);
        return {ok: true};
      }

      log('Unlock failed', result.error);
      return {ok: false, error: result.error};
    },
    [setStoredPassword]
  );

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Auto-unlock on mount: if we already have a working password from a
  // previous session, fetch fresh keys for this tab. On 401 (password
  // rotated server-side) we clear the stored password so the sidebar shows
  // the input again.
  useEffect(
    () => {
      if (!storedPassword || apiKey) return;

      let cancelled = false;

      void (async () => {
        const result = await unlockKeys(storedPassword);
        if (cancelled) return;

        if (result.ok) {
          setApiKey(result.ttsKey);
          setLlmKey(result.llmKey);
          return;
        }

        log('Auto-unlock failed', result.error);
        setStoredPassword('');
      })();

      return () => {
        cancelled = true;
      };
    },
    [storedPassword, apiKey, setStoredPassword]
  );

  // Swap the html background and Mobile Safari URL-bar tint to the variant's
  // sky color while this page is mounted; restore on unmount so the dev page
  // keeps its dark theme. Also force `color-scheme: light` because Safari on
  // dark-mode iOS otherwise ignores light theme-colors as a "wrong scheme"
  // mismatch — the global :root sets `color-scheme: dark` for /dev's
  // benefit.
  useEffect(
    () => {
      const html = document.documentElement;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const prevHtmlBg = html.style.backgroundColor;
      const prevColorScheme = html.style.colorScheme;
      const prevThemeColor = meta?.getAttribute('content') ?? null;

      html.style.backgroundColor = variant.skyColor;
      html.style.colorScheme = 'light';
      meta?.setAttribute('content', variant.skyColor);

      return () => {
        html.style.backgroundColor = prevHtmlBg;
        html.style.colorScheme = prevColorScheme;
        if (prevThemeColor !== null) meta?.setAttribute('content', prevThemeColor);
      };
    },
    [variant.skyColor]
  );


  // Close settings on Escape. Listener attached only while open so it doesn't
  // sit on the window forever.
  useEffect(
    () => {
      if (!settingsOpen) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeSettings();
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    },
    [settingsOpen, closeSettings]
  );

  // ESC aborts an in-flight STT capture without dispatching the (likely
  // garbled) transcript to the LLM. Skipped while focus is on a form input
  // so it doesn't intercept the native blur behaviour.
  useEffect(
    () => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (!isListeningRef.current) return;
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        cancelListening();
        log('Cancelled');
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    },
    [cancelListening]
  );

  // TTFA capture: time from STT final to first audio frame.
  useEffect(
    () => {
      if (status === 'speaking' && turnStartTimeRef.current !== null) {
        const delta = Date.now() - turnStartTimeRef.current;
        setTtfaMs(delta);
        turnStartTimeRef.current = null;
        log('TTFA', `${delta}ms`);
      }
    },
    [status]
  );

  // Return Flori's face to the listening rest state once a reply finishes
  // playing — emotion is LLM-driven on home, so manual selection isn't a
  // concern here.
  useEffect(
    () => {
      const isSpeaking = status === 'speaking';
      if (wasSpeakingRef.current && !isSpeaking) {
        setCurrentEmotion(0);
        log('Emotion reset → listening');
      }
      wasSpeakingRef.current = isSpeaking;
    },
    [status, setCurrentEmotion]
  );

  // Idle gestures — fire a random IDLE_GESTURE_TRIGGERS pick every
  // 5–14s while the app is truly idle (pttState collapses listening /
  // initializing / thinking / processing / speaking into non-idle states).
  // "No two excited_* in a row" is enforced by filtering the pool when the
  // last pick was excited_*.
  useEffect(
    () => {
      if (pttState !== 'idle' || !characterReady) return;

      let timerId: number;

      const scheduleNext = () => {
        const isFirst = lastIdleGestureRef.current === null;
        const minMs = isFirst ? IDLE_GESTURE_FIRST_DELAY_MIN_MS : IDLE_GESTURE_DELAY_MIN_MS;
        const maxMs = isFirst ? IDLE_GESTURE_FIRST_DELAY_MAX_MS : IDLE_GESTURE_DELAY_MAX_MS;
        const delay = minMs + Math.random() * (maxMs - minMs);
        timerId = window.setTimeout(
          () => {
            const lastWasExcited = lastIdleGestureRef.current?.startsWith('excited_') ?? false;
            const pool = lastWasExcited ?
              _.filter(IDLE_GESTURE_TRIGGERS, name => !name.startsWith('excited_'))
              :
              IDLE_GESTURE_TRIGGERS;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            lastIdleGestureRef.current = pick;
            riveRef.current?.fireTrigger(pick);
            log(`Idle gesture → ${pick}`);
            scheduleNext();
          },
          delay
        );
      };

      scheduleNext();

      return () => clearTimeout(timerId);
    },
    [pttState, characterReady]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <>
      <div
        ref={homeRef}
        className={cn(
          'home fixed inset-0 overflow-hidden font-sans bg-[#291C29]',
          'transition-transform duration-300 ease-out',
          // Mobile shifts the whole frame; desktop stays put — the inner
          // stage narrows and the frame overlay grows in place instead.
          settingsOpen && '-translate-x-[min(100vw,400px)] sm:translate-x-0'
        )}
      >
        {/* Stage — sky-coloured content layer. Stays pinned to viewport
          * edges on top/left/bottom; only the right narrows by 400px when
          * the sidebar opens. Content inside (Background/Header/Flori/
          * Footer) keeps its full-bleed positioning — the dark frame is
          * painted on top by the overlay below, not by shrinking this
          * container.
          */}
        <div
          className={cn(
            'absolute top-0 bottom-0 left-0 min-h-[550px]',
            'transition-[right] duration-300 ease-out',
            settingsOpen ? 'right-0 sm:right-[400px]' : 'right-0'
          )}
          style={{backgroundColor: variant.skyColor}}
        >
          <Background variant={variant}/>
          <Header
            muted={muted}
            settingsOpen={settingsOpen}
            onMuteClick={toggleMute}
            onSettingsClick={toggleSettings}
          />

          <div className="absolute inset-0 pb-20 z-0 flex items-center justify-center">
            <div className="relative translate-y-[34px]">
              {
                // Soft elliptical shadow under Flori. Painted before the
                // canvas so the character paints on top. `bottom-[108px]`
                // sits the shadow just below Flori's feet inside the
                // 512×512 home canvas. Fades in and scales 95% → 100% so
                // it reads like Flori is landing onto the ground.
                variant.shadowColor &&
                <div
                  className="absolute bottom-[108px] left-1/2 w-[160px] h-[36px] rounded-[50%] transition-transform duration-1000 ease-out"
                  style={{
                    backgroundColor: variant.shadowColor,
                    opacity: characterReady ? 1 : 0,
                    transform: `translateX(-50%) scale(${characterReady ? 1 : 0.85})`,
                  }}
                />
              }

              {/* Flori herself: fades in and lands from -10px above. */}
              <div
                className="transition-[opacity,transform] duration-1000 ease-out"
                style={{
                  opacity: characterReady ? 1 : 0,
                  transform: `translateY(${characterReady ? 0 : -10}px)`,
                }}
              >
                <RiveCharacter
                  ref={riveRef}
                  currentViseme={currentViseme}
                  currentEmotion={currentEmotion}
                  onReady={handleCharacterReady}
                />
              </div>
            </div>
          </div>

          <Footer
            hintColor={variant.hintColor}
            pttState={pttState}
            stream={stream}
            interim={interim}
            isListening={isListening}
            onPressStart={handlePttStart}
            onPressEnd={handlePttEnd}
          />
        </div>

        {/* Frame overlay — a rounded transparent "window" with a massive
          * dark box-shadow extending past its bounds. The `.home`'s
          * `overflow-hidden` clips the shadow so we only see dark in the
          * gap between the window's edges and the viewport. Window
          * geometry animates 0 → 8px inset on top/left/bottom + 0 → 400px
          * on the right + 0 → 40px corner radius. Stage content underneath
          * keeps its full-bleed layout — no jitter when frame appears.
          */}
        <div
          className={cn(
            'absolute pointer-events-none shadow-[0_0_0_9999px_#291C29]',
            'transition-[top,right,bottom,left,border-radius] duration-300 ease-out',
            settingsOpen ?
              'top-0 right-0 bottom-0 left-0 sm:top-2 sm:right-[400px] sm:bottom-2 sm:left-2 sm:rounded-[40px]'
              :
              'top-0 right-0 bottom-0 left-0'
          )}
        />
      </div>

      {
        // Invisible click-trap that closes the sidebar without dimming the
        // stage. Mounted only while open so it doesn't swallow stage clicks.
        settingsOpen &&
        <div
          className="fixed inset-0 z-[15]"
          onClick={closeSettings}
        />
      }

      <SettingsSidebar
        open={settingsOpen}
        unlocked={hasKeys}
        isConnected={isConnected}
        transcript={transcript}
        ttftMs={ttftMs}
        ttfaMs={ttfaMs}
        onClose={closeSettings}
        onUnlock={handleUnlock}
        onDisconnect={disconnect}
        onSwipeOffset={handleSidebarSwipe}
      />
    </>
  );
};

export default Home;
