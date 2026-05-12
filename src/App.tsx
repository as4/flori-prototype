import {useState, useCallback, useEffect, useRef} from 'react';
import _ from 'lodash';
import useLocalStorage from './hooks/useLocalStorage';
import useInworldTTS from './hooks/useInworldTTS';
import useLLMChat from './hooks/useLLMChat';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import useEmotionQueue from './hooks/useEmotionQueue';
import RiveCharacterDev from './components/dev/RiveCharacterDev';
import PushToTalkButton from './components/dev/PushToTalkButton';
import DebugPanel from './components/dev/DebugPanel';
import LLMConfig from './components/dev/LLMConfig';
import TTSConfig from './components/dev/TTSConfig';
import SecretInput from './components/dev/SecretInput';
import Transcript, {type TranscriptTurn} from './components/dev/Transcript';
import PersonaEditor from './components/dev/PersonaEditor';
import EmotionPromptEditor from './components/dev/EmotionPromptEditor';
import TextDebugInput from './components/dev/TextDebugInput';
import {DEFAULT_LLM_PROVIDER, useLLMProviders} from './llm/providers';
import type {LLMProviderId} from './llm/providers';
import {DEFAULT_TTS_MODEL} from './config';
import {DEFAULT_SYSTEM_PROMPT, DEFAULT_EMOTION_PROMPT} from './home-config';
import type {EmotionName} from './emotions';
import {scramble} from './api/scramble';
import {unlockKeys} from './api/unlock';
import {log} from './utils/log';
import './App.css';

////////////////////////////////////////////////////////////////////////////////

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  processing: 'Processing...',
  speaking: 'Speaking',
  error: 'Error',
};

const STT_LANGUAGES = [
  {id: 'en-US', label: 'English'},
  {id: 'ru-RU', label: 'Russian'},
] as const;

////////////////////////////////////////////////////////////////////////////////

const App = () => {
  const [apiKey, setApiKey] = useLocalStorage('flori-api-key');
  const [llmProviderId, setLlmProviderId] = useLocalStorage('flori-llm-provider', DEFAULT_LLM_PROVIDER);
  const llmProviders = useLLMProviders();
  const activeLLM = llmProviders[llmProviderId as LLMProviderId];
  const [voiceId, setVoiceId] = useLocalStorage('flori-voice-id', 'Hana');
  const [modelId, setModelId] = useLocalStorage('flori-tts-model', DEFAULT_TTS_MODEL);
  const [streamModeStr, setStreamModeStr] = useLocalStorage('flori-stream-mode', 'true');
  const streamMode = streamModeStr === 'true';
  const [systemPrompt, setSystemPrompt] = useLocalStorage('flori-system-prompt', DEFAULT_SYSTEM_PROMPT);
  const [emotionPrompt, setEmotionPrompt] = useLocalStorage('flori-emotion-prompt', DEFAULT_EMOTION_PROMPT);
  const [useLLMEmotionStr, setUseLLMEmotionStr] = useLocalStorage('flori-llm-emotion', 'true');
  const useLLMEmotion = useLLMEmotionStr === 'true';
  const [sttLanguage, setSttLanguage] = useLocalStorage('flori-stt-language', 'en-US');

  // Shared with Home (`flori-password`) so unlocking on either page propagates
  // to the other. `flori-google-ai-key` matches the key the Gemini provider
  // binds to internally, so writing it here updates the provider live.
  const [storedPassword, setStoredPassword] = useLocalStorage('flori-password');
  const [, setGeminiApiKey] = useLocalStorage('flori-google-ai-key');
  const [accessCode, setAccessCode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const {
    currentEmotion,
    setCurrentEmotion,
    enqueue: enqueueEmotion,
    reset: resetEmotionQueue,
    onSegmentStart,
  } = useEmotionQueue({enabled: useLLMEmotion});

  // State
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);

  // Set later, after useSpeechRecognition runs. Read by handleChatDone to skip
  // TTS if the user has already started barging in over the previous reply.
  const isListeningRef = useRef(false);

  // Latency measurements: stamp the moment we hand the turn off (STT final)
  // and capture two deltas — TTFT (first LLM token) and TTFA (first audio).
  // Splitting them makes it obvious when a slow turn is the LLM vs the TTS.
  const turnStartTimeRef = useRef<number | null>(null);
  const ttftLoggedRef = useRef(false);
  const [ttftMs, setTtftMs] = useState<number | null>(null);
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);

  //--------------------------------------------------------------------------
  //
  //  Hooks pipeline (callbacks feed into the hooks below them)
  //
  //--------------------------------------------------------------------------

  const {
    status: ttsStatus,
    currentViseme,
    connect,
    beginTurn,
    streamSentence,
    sendText,
    stopPlayback,
    disconnect,
    ensureAudioReady,
  } = useInworldTTS({
    apiKey,
    voiceId,
    modelId,
    onSegmentStart,
  });

  const isConnected = ttsStatus === 'connected' || ttsStatus === 'speaking';

  const handleSentence = useCallback(
    (sentence: string, emotion?: EmotionName) => {
      if (!streamMode) return;
      if (isListeningRef.current) return;
      if (!isConnected) {
        log('Not connected — skipping sentence');
        return;
      }
      enqueueEmotion(emotion);
      log('Sentence → TTS', sentence);
      streamSentence(sentence);
    },
    [streamMode, isConnected, streamSentence, enqueueEmotion]
  );

  const handleChatDone = useCallback(
    (fullText: string, rawText: string) => {
      const reply = fullText.trim();
      if (!reply) return;
      const rawReply = rawText.trim() || reply;
      setTranscript(previous => [...previous, {role: 'assistant', text: rawReply}]);
      log('LLM reply', rawReply);
      if (streamMode) return;
      if (isListeningRef.current) return;
      if (!isConnected) {
        log('Not connected — skipping reply');
        return;
      }
      log('Full reply → TTS', reply);
      sendText(reply);
    },
    [streamMode, isConnected, sendText]
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

  const effectiveSystemPrompt = useLLMEmotion ? `${systemPrompt}\n\n${emotionPrompt}` : systemPrompt;

  const {send: sendToChat, isStreaming, reset: resetChat, cancel: cancelLLM} = useLLMChat({
    adapter: activeLLM.adapter,
    systemPrompt: effectiveSystemPrompt,
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
      setTranscript(previous => [...previous, {role: 'user', text: sttTranscript}]);
      log('Heard', sttTranscript);
      log('Sending to LLM', {provider: activeLLM.id});
      turnStartTimeRef.current = Date.now();
      ttftLoggedRef.current = false;
      setTtftMs(null);
      setTtfaMs(null);
      resetEmotionQueue();
      beginTurn();
      sendToChat(sttTranscript);
    },
    [sendToChat, activeLLM.id, beginTurn, resetEmotionQueue]
  );

  const handleSttError = useCallback(
    (message: string) => {
      log('Speech recognition error', message);
    },
    []
  );

  const {
    isListening,
    transcript: liveTranscript,
    interim,
    supported: speechSupported,
    start: startListening,
    stop: stopListening,
    cancel: cancelListening,
  } = useSpeechRecognition({
    lang: sttLanguage,
    onFinal: handleSttFinal,
    onError: handleSttError,
  });

  isListeningRef.current = isListening;
  const liveSpeech = isListening ? `${liveTranscript} ${interim}`.trim() : '';

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

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

  // Auto-unlock on mount: if a previous session already exchanged a password
  // for keys, fetch fresh ones now. On failure we clear the stored password
  // so the access-code input is shown again.
  useEffect(
    () => {
      if (!storedPassword || apiKey) return;

      let cancelled = false;

      void (async () => {
        const result = await unlockKeys(storedPassword);
        if (cancelled) return;

        if (result.ok) {
          setApiKey(result.ttsKey);
          setGeminiApiKey(result.llmKey);
          return;
        }

        log('Auto-unlock failed', result.error);
        setStoredPassword('');
      })();

      return () => {
        cancelled = true;
      };
    },
    [storedPassword, apiKey, setApiKey, setGeminiApiKey, setStoredPassword]
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

  // Return Flori's face to the listening rest state once a reply finishes
  // playing. Only when the LLM is driving emotion — otherwise the manual
  // buttons own currentEmotion and we'd stomp the user's selection.
  const wasSpeakingRef = useRef(false);

  useEffect(
    () => {
      const isSpeaking = status === 'speaking';
      if (wasSpeakingRef.current && !isSpeaking && useLLMEmotion) {
        setCurrentEmotion(0);
        log('Emotion reset → listening');
      }
      wasSpeakingRef.current = isSpeaking;
    },
    [status, useLLMEmotion]
  );

  const pttState =
    !isConnected || !activeLLM.apiKey ? 'disabled' as const :
    isListening ? 'listening' as const :
    isStreaming ? 'thinking' as const :
    (status === 'speaking' || status === 'processing') ? 'speaking' as const :
    'idle' as const;

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleUnlock = useCallback(
    async () => {
      setUnlocking(true);
      setUnlockError(null);
      const scrambled = scramble(accessCode);
      const result = await unlockKeys(scrambled);
      setUnlocking(false);

      if (result.ok) {
        setApiKey(result.ttsKey);
        setGeminiApiKey(result.llmKey);
        setStoredPassword(scrambled);
        setAccessCode('');
        return;
      }

      log('Unlock failed', result.error);
      setUnlockError(result.error);
    },
    [accessCode, setApiKey, setGeminiApiKey, setStoredPassword]
  );

  const handleResetChat = () => {
    resetChat();
    setTranscript([]);
    log('Conversation reset');
  };

  const handlePttStart = () => {
    cancelLLM();
    stopPlayback();
    resetEmotionQueue();
    ensureAudioReady();
    startListening();
  };

  const handleTextDebugSend = useCallback(
    (text: string) => {
      log('Typed', text);
      sendText(text);
    },
    [sendText]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flori</h1>
        <div className="header-right">
          {
            (ttftMs !== null || ttfaMs !== null) &&
            <span className="ttfa-pill" title="Time-to-first-token (LLM) • time-to-first-audio (TTS)">
              {ttftMs !== null ? `TTFT ${ttftMs}ms` : 'TTFT —'}
              {' • '}
              {ttfaMs !== null ? `TTFA ${ttfaMs}ms` : 'TTFA —'}
            </span>
          }
          <span className={`status status-${status}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
      </header>

      <div className="app-layout">
        <div className="panel panel-character">
          <RiveCharacterDev
            currentViseme={currentViseme}
            currentEmotion={currentEmotion}
            useLLMEmotion={useLLMEmotion}
            onCurrentEmotionChange={setCurrentEmotion}
            onUseLLMEmotionChange={value => setUseLLMEmotionStr(String(value))}
          />

          <div className="form-row">
            {
              isConnected ?
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={disconnect}
                >
                  Disconnect
                </button>
                :
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!apiKey || status === 'connecting'}
                  onClick={connect}
                >
                  Connect
                </button>
            }
          </div>

          <PushToTalkButton
            state={pttState}
            interim={liveSpeech}
            onPressStart={handlePttStart}
            onPressEnd={stopListening}
          />

          {
            !speechSupported &&
            <div className="rive-error">
              Speech recognition not supported in this browser — use the text input below.
            </div>
          }
        </div>

        <div className="panel panel-controls">
          <div className="form-group">
            <SecretInput
              label="Access code"
              placeholder="Enter access code..."
              value={accessCode}
              onChange={setAccessCode}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={!accessCode || unlocking}
              onClick={handleUnlock}
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </button>
            {
              unlockError &&
              <div className="rive-error">{unlockError}</div>
            }
          </div>

          <hr className="section-divider" />

          <LLMConfig
            providers={llmProviders}
            activeProviderId={llmProviderId as LLMProviderId}
            onProviderChange={setLlmProviderId}
          />

          <hr className="section-divider" />

          <TTSConfig
            apiKey={apiKey}
            voiceId={voiceId}
            modelId={modelId}
            isConnected={isConnected}
            streamMode={streamMode}
            onApiKeyChange={setApiKey}
            onVoiceIdChange={setVoiceId}
            onModelIdChange={setModelId}
            onStreamModeChange={value => setStreamModeStr(String(value))}
          />

          <hr className="section-divider" />

          <div className="form-group">
            <label>STT language</label>
            <div className="mode-switcher compact">
              {
                _.map(
                  STT_LANGUAGES,
                  language => (
                    <button
                      key={language.id}
                      className={sttLanguage === language.id ? 'active' : ''}
                      type="button"
                      onClick={() => setSttLanguage(language.id)}
                    >
                      {language.label}
                    </button>
                  )
                )
              }
            </div>
          </div>

          <hr className="section-divider" />

          <PersonaEditor
            value={systemPrompt}
            defaultValue={DEFAULT_SYSTEM_PROMPT}
            onChange={setSystemPrompt}
          />

          <EmotionPromptEditor
            value={emotionPrompt}
            defaultValue={DEFAULT_EMOTION_PROMPT}
            onChange={setEmotionPrompt}
          />

          <Transcript turns={transcript} onReset={handleResetChat} />

          <TextDebugInput
            isConnected={isConnected}
            isProcessing={status === 'processing'}
            isSpeaking={status === 'speaking'}
            onSend={handleTextDebugSend}
          />

          <DebugPanel/>
        </div>
      </div>
    </div>
  );
};

export default App;
