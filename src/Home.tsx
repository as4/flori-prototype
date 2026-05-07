import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import RiveCharacter from './components/RiveCharacter';
import Background, {pickBgVariant} from './components/home/Background';
import Header from './components/home/Header';
import Footer from './components/home/Footer';
import SettingsSidebar from './components/home/SettingsSidebar';
import type {PttState} from './components/home/PttButton';
import useLocalStorage from './hooks/useLocalStorage';
import useEmotionQueue from './hooks/useEmotionQueue';
import useInworldTTS from './hooks/useInworldTTS';
import useLLMChat from './hooks/useLLMChat';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import {createGoogleAdapter} from './llm/google/adapter';
import type {EmotionName} from './emotions';
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_EMOTION_PROMPT,
  HOME_TTS_MODEL,
  HOME_TTS_VOICE,
  HOME_LLM_MODEL,
} from './home-config';
import {cn} from './utils/cn';
import {log} from './utils/log';
import './Home.css';

////////////////////////////////////////////////////////////////////////////////

const SYSTEM_PROMPT = `${DEFAULT_SYSTEM_PROMPT}\n\n${DEFAULT_EMOTION_PROMPT}`;
const MIC_DENIED_PATTERN = /denied|not-allowed|service-not-allowed|service permission/i;

// iOS Safari steals window focus when it shows a system permission prompt
// without firing pointercancel on our button. We treat blur during a press
// as an auto-release. Desktop browsers blur for unrelated reasons (alt-tab,
// devtools focus), so this only kicks in on iOS.
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

////////////////////////////////////////////////////////////////////////////////

const Home = () => {
  const variant = useMemo(pickBgVariant, []);

  const [apiKey, setApiKey] = useLocalStorage('flori-api-key');
  const [llmKey, setLlmKey] = useLocalStorage('flori-google-ai-key');

  const [characterReady, setCharacterReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [pttPressed, setPttPressed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ttftMs, setTtftMs] = useState<number | null>(null);
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);

  const turnStartTimeRef = useRef<number | null>(null);
  const ttftLoggedRef = useRef(false);
  const isListeningRef = useRef(false);
  const wasSpeakingRef = useRef(false);

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
      log('LLM reply', rawText.trim() || reply);
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

  isListeningRef.current = isListening;

  ////////////////////////////////////////////////////////////////////////////////

  const hasKeys = Boolean(apiKey) && Boolean(llmKey);

  // Once TTS is past 'connecting', a press goes optimistically straight to
  // listening — the getUserMedia probe + recognition.start handshake only
  // takes ~100ms when permission is already granted, but a brief
  // 'initializing' flash on every tap reads as laggy. We only show
  // 'initializing' when there's a real wait worth signaling: TTS is still
  // mid-connect and the user is pressing.
  const pttState: PttState =
    !hasKeys ? 'no-keys' :
    micDenied ? 'denied' :
    isListening ? 'listening' :
    pttPressed && ttsStatus === 'connecting' ? 'initializing' :
    pttPressed ? 'listening' :
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

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handlePttStart = useCallback(
    () => {
      if (pttState === 'no-keys' || pttState === 'denied') return;
      setPttPressed(true);
      // Cancel any in-flight LLM/TTS turn so barge-in is clean.
      cancelLLM();
      beginTurn();
      resetEmotionQueue();
      ensureAudioReady();
      // Auto-connect on first press. fire-and-forget; useInworldTTS owns the
      // socket lifecycle.
      // Auto-connect on first press. fire-and-forget; useInworldTTS owns the
      // socket lifecycle.
      if (ttsStatus === 'disconnected' || ttsStatus === 'error') {
        connect();
      }
      startListening();
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

  const handleSave = useCallback(
    ({ttsKey, llmKey}: {ttsKey: string; llmKey: string}) => {
      setApiKey(ttsKey);
      setLlmKey(llmKey);
    },
    [setApiKey, setLlmKey]
  );

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Swap the html background and Mobile Safari URL-bar tint to the variant's
  // sky color while this page is mounted; restore on unmount so the dev page
  // keeps its dark theme.
  useEffect(
    () => {
      const html = document.documentElement;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const prevHtmlBg = html.style.backgroundColor;
      const prevThemeColor = meta?.getAttribute('content') ?? null;

      html.style.backgroundColor = variant.skyColor;
      meta?.setAttribute('content', variant.skyColor);

      return () => {
        html.style.backgroundColor = prevHtmlBg;
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

  // iOS-only: when a system prompt steals focus mid-press, our pointerup
  // never arrives. Treat blur during a press as an implicit release so the
  // PTT button doesn't stay stuck after the user grants/denies permission.
  useEffect(
    () => {
      if (!pttPressed || !isIOS()) return;

      const handleBlur = () => {
        log('Window blurred during press — auto-releasing PTT');
        setPttPressed(false);
        stopListening();
      };

      window.addEventListener('blur', handleBlur);
      return () => window.removeEventListener('blur', handleBlur);
    },
    [pttPressed, stopListening]
  );

  // Subscribe to the Permissions API for microphone state. iOS Safari
  // sometimes silently kills recognition on the first denial without firing
  // onerror, but the Permissions API still reflects the OS-level decision —
  // so this gives us a deterministic signal independent of the recognition
  // event stream. Falls back gracefully when the browser doesn't support
  // querying `microphone` (older Firefox, some embedded webviews).
  useEffect(
    () => {
      const permissions = navigator.permissions;
      if (!permissions?.query) {
        log('Permissions API unavailable');
        return;
      }

      let cancelled = false;
      let status: PermissionStatus | null = null;
      let handle: (() => void) | null = null;

      permissions.query({name: 'microphone' as PermissionName})
        .then(permStatus => {
          if (cancelled) return;
          status = permStatus;

          handle = () => {
            log('Mic permission state', permStatus.state);
            if (permStatus.state === 'denied') setMicDenied(true);
            if (permStatus.state === 'granted') setMicDenied(false);
          };

          handle();
          permStatus.addEventListener('change', handle);
        })
        .catch(error => log('Mic permissions.query rejected', (error as Error).message));

      return () => {
        cancelled = true;
        if (status && handle) status.removeEventListener('change', handle);
      };
    },
    []
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

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <>
      <div
        className={cn(
          'home fixed inset-0 overflow-hidden font-sans',
          'transition-transform duration-300 ease-out',
          settingsOpen && '-translate-x-[400px]'
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
              // Soft elliptical shadow under Flori. Painted before the canvas
              // so the character paints on top. `bottom-[108px]` sits the
              // shadow just below Flori's feet inside the 512×512 home canvas.
              // Fades in and scales 95% → 100% so it reads like Flori is
              // landing onto the ground.
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
        ttsKey={apiKey}
        llmKey={llmKey}
        isConnected={isConnected}
        ttftMs={ttftMs}
        ttfaMs={ttfaMs}
        onClose={closeSettings}
        onSave={handleSave}
        onDisconnect={disconnect}
      />
    </>
  );
};

export default Home;
