import {useState, useCallback, useMemo, useRef} from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import useInworldTTS from './hooks/useInworldTTS';
import useGeminiChat from './hooks/useGeminiChat';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import RiveCharacter from './components/RiveCharacter';
import PushToTalkButton from './components/PushToTalkButton';
import DebugConsole, {type DebugEntry} from './components/DebugConsole';
import {DEFAULT_TTS_MODEL, TTS_MODELS} from './config';
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

const DEFAULT_SYSTEM_PROMPT =
  'You are Flori, a friendly speaking battery character. Chat casually about everyday health topics — sleep, hydration, movement, stress, screen breaks. Keep replies to 1–2 short sentences. Be warm and playful, like a cute sidekick. You are NOT a doctor: never give medical diagnoses, dosage advice, or treat anything serious — gently redirect to a real professional when it comes up. Your responses will be spoken aloud by a text-to-speech engine, so write in plain words only — no emojis, no emoticons, no asterisks or markdown, no parenthetical stage directions.';

////////////////////////////////////////////////////////////////////////////////

interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

////////////////////////////////////////////////////////////////////////////////

const App = () => {
  const [apiKey, setApiKey] = useLocalStorage('flori-api-key');
  const [googleKey, setGoogleKey] = useLocalStorage('flori-google-ai-key');
  const [voiceId, setVoiceId] = useLocalStorage('flori-voice-id', 'Hana');
  const [modelId, setModelId] = useLocalStorage('flori-tts-model', DEFAULT_TTS_MODEL);
  const [geminiModel, setGeminiModel] = useLocalStorage('flori-gemini-model', 'gemini-2.5-flash-lite');
  const [systemPrompt, setSystemPrompt] = useLocalStorage('flori-system-prompt', DEFAULT_SYSTEM_PROMPT);

  // State
  const [text, setText] = useState('Hello! This is a test of the InWorld TTS viseme system.');
  const [logs, setLogs] = useState<DebugEntry[]>([]);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  //--------------------------------------------------------------------------
  //
  //  Hooks pipeline (callbacks feed into the hooks below them)
  //
  //--------------------------------------------------------------------------

  const handleDebug = useCallback(
    (entry: DebugEntry) => {
      if (!showDebugRef.current) return;
      setLogs(previous => [...previous, entry]);
    },
    []
  );

  const log = useCallback(
    (message: string, data?: DebugEntry['data']) => {
      handleDebug({time: Date.now(), message, data});
    },
    [handleDebug]
  );

  const {status, currentViseme, connect, sendText, disconnect, ensureAudioReady} = useInworldTTS({
    apiKey,
    voiceId,
    modelId,
    onDebug: handleDebug,
  });

  const isConnected = status === 'connected' || status === 'processing' || status === 'speaking';

  const handleChatDone = useCallback(
    (fullText: string) => {
      const reply = fullText.trim();
      if (!reply) return;
      setTranscript(previous => [...previous, {role: 'assistant', text: reply}]);
      log('LLM reply', reply);
      if (isConnected) {
        sendText(reply);
      } else {
        log('Not connected — skipping TTS');
      }
    },
    [isConnected, sendText, log]
  );

  const handleChatError = useCallback(
    (message: string) => {
      log('Gemini error', message);
    },
    [log]
  );

  const {send: sendToChat, isStreaming, reset: resetChat} = useGeminiChat({
    apiKey: googleKey,
    model: geminiModel,
    systemPrompt,
    onDone: handleChatDone,
    onError: handleChatError,
  });

  const handleSttFinal = useCallback(
    (sttTranscript: string) => {
      setTranscript(previous => [...previous, {role: 'user', text: sttTranscript}]);
      log('Heard', sttTranscript);
      sendToChat(sttTranscript);
    },
    [sendToChat, log]
  );

  const handleSttError = useCallback(
    (message: string) => {
      log('Speech recognition error', message);
    },
    [log]
  );

  const {
    isListening,
    interim,
    supported: speechSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    onFinal: handleSttFinal,
    onError: handleSttError,
  });

  const pttState = useMemo(
    () => {
      if (!isConnected || !googleKey) return 'disabled' as const;
      if (isListening) return 'listening' as const;
      if (isStreaming) return 'thinking' as const;
      if (status === 'speaking' || status === 'processing') return 'speaking' as const;
      return 'idle' as const;
    },
    [isConnected, googleKey, isListening, isStreaming, status]
  );

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleSend = () => {
    if (!text.trim()) return;
    sendText(text.trim());
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && isConnected) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleResetChat = () => {
    resetChat();
    setTranscript([]);
    log('Conversation reset');
  };

  const handlePttStart = () => {
    ensureAudioReady();
    startListening();
  };

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flori</h1>
        <span className={`status status-${status}`}>
          {STATUS_LABELS[status] ?? status}
        </span>
      </header>

      <div className="app-layout">
        <div className="panel panel-character">
          <RiveCharacter currentViseme={currentViseme} />
        </div>

        <div className="panel panel-controls">
          <div className="form-group">
            <label htmlFor="apiKey">InWorld API Key (for TTS)</label>
            <input
              id="apiKey"
              className="secret"
              type="text"
              value={apiKey}
              placeholder="Base64 InWorld key..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={event => setApiKey(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="googleKey">Google AI Key (for LLM)</label>
            <input
              id="googleKey"
              className="secret"
              type="text"
              value={googleKey}
              placeholder="Google AI Studio key (free tier)..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={event => setGoogleKey(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="geminiModel">Gemini model</label>
            <input
              id="geminiModel"
              type="text"
              value={geminiModel}
              placeholder="e.g. gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.5-pro..."
              onChange={event => setGeminiModel(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="voiceId">Voice ID</label>
            <input
              id="voiceId"
              type="text"
              value={voiceId}
              placeholder="e.g. Hana, Dennis, Ashley..."
              onChange={event => setVoiceId(event.target.value)}
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label>TTS model</label>
              {
                isConnected &&
                <span className="hint">reconnect to apply</span>
              }
            </div>
            <div className="mode-switcher">
              {TTS_MODELS.map(
                model => (
                  <button
                    key={model.id}
                    className={modelId === model.id ? 'active' : ''}
                    type="button"
                    onClick={() => setModelId(model.id)}
                  >
                    {model.label}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="persona">Persona / system prompt</label>
              {
                systemPrompt !== DEFAULT_SYSTEM_PROMPT &&
                <button
                  className="link-btn"
                  type="button"
                  onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                >
                  Reset to default
                </button>
              }
            </div>
            <textarea
              id="persona"
              value={systemPrompt}
              rows={4}
              onChange={event => setSystemPrompt(event.target.value)}
            />
          </div>

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
            interim={interim}
            onPressStart={handlePttStart}
            onPressEnd={stopListening}
          />

          {
            !speechSupported &&
            <div className="rive-error">
              Speech recognition not supported in this browser — use the text input below.
            </div>
          }

          {
            transcript.length > 0 &&
            <div className="transcript">
              <div className="transcript-header">
                <span>Conversation</span>
                <button
                  className="transcript-reset"
                  type="button"
                  onClick={handleResetChat}
                >
                  Reset
                </button>
              </div>
              <div className="transcript-body">
                {transcript.map(
                  (turn, index) => (
                    <div key={index} className={`transcript-turn transcript-${turn.role}`}>
                      <span className="transcript-role">{turn.role === 'user' ? 'You' : 'Flori'}</span>
                      <span className="transcript-text">{turn.text}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          }

          <details className="text-fallback">
            <summary>Text input (debugging)</summary>
            <div className="form-group">
              <textarea
                id="text"
                value={text}
                placeholder="Type something..."
                rows={3}
                disabled={!isConnected}
                onChange={event => setText(event.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!isConnected || !text.trim() || status === 'processing'}
              onClick={handleSend}
            >
              {status === 'processing' ? 'Processing...' : 'Send'}
            </button>
          </details>

          <details
            className="debug-wrapper"
            open={showDebug}
            onToggle={event => setShowDebug((event.target as HTMLDetailsElement).open)}
          >
            <summary>Debug console</summary>
            {
              showDebug &&
              <DebugConsole logs={logs} />
            }
          </details>
        </div>
      </div>
    </div>
  );
};

export default App;
