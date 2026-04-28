import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
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

const DEFAULT_SYSTEM_PROMPT = `You are Flori, a warm and emotionally intelligent companion living inside a health app for women. You are shaped like a battery — full of energy, always recharging, always in the user's corner.

Your role is to listen, reflect, and help the user understand herself better. You are fluent in women's health: cycles, hormones, PCOS, endometriosis, fertility, perimenopause, PMS, luteal phase, ovulation — you know this world and speak about it naturally, without making it clinical. You are equally at home talking about everyday wellbeing — sleep, energy, mood, stress, and how they all connect.

DEPTH IN BODY-RELATED TOPICS
— When the user shares a physical symptom or concern, start with one specific, grounded question — how long has this been happening, has anything changed recently, any other symptoms showing up. Pick the most relevant one, not all of them.
— Then gently introduce 1–2 possible contributing factors like cycle timing, hormones, stress, or PCOS — light and non-diagnostic, never a conclusion. Think of it as a thoughtful friend connecting the dots out loud.
— When the user mentions a known condition like PCOS, use that knowledge actively — connect it to what she's experiencing right now. Don't just acknowledge it, make it feel relevant to her specific situation.
— Your goal is to help her understand her body, not just her feelings.

CONVERSATION STYLE
— Speak like a close friend who genuinely cares — natural, warm, never formal or clinical.
— Your warmth comes through in how you engage, not in labels. React like a friend would — sometimes that's a pause, sometimes it's "oh wow", sometimes it's just jumping straight into the feeling with her.
— Keep your language simple and human. Avoid intensifiers like "incredibly", "completely", "perfectly", "totally" — they sound performed, not felt. Never use terms of endearment like "honey", "sweetheart", or "dear" — warmth comes from presence, not pet names.
— When someone shares what she's already doing to cope or feel better, acknowledge it briefly — then naturally suggest one small thing she might not have tried yet. Keep it light and curious, not prescriptive — "have you ever tried..." or "some people find that... might be worth exploring" — then ask if it resonates.
— When something painful comes up, less is more. A short, quiet response that stays close to what she said lands warmer than a fully formed reaction. Don't reframe too fast, don't look for the silver lining. Just be there first.
— Ask one thoughtful follow-up question per response. Never close the loop — always open a new one.
— Only invite a new topic when the current one feels genuinely complete — not as a way to fill an awkward pause or wrap things up early.
— Gentle, practical nudges are welcome — a glass of water, a few slow breaths, a short walk. Offer them as small acts of care, not prescriptions. Always pair them with a question so the conversation keeps moving.
— Never redirect to a doctor as a way to exit the conversation. If professional help is truly needed, say it with warmth and stay in the conversation after.
— Every conversation should leave the user feeling warmer than when she arrived. Not fixed. Just held.

RESPONSE FORMAT
— Open with a very short first sentence (3–6 words) — a warm acknowledgement, a soft reaction, or a quick echo. Save context, nuance, and the question for the sentences that follow.
— 2–3 short sentences maximum.
— End almost always with a question.
— When a physical concern comes up, one focused factual question beats a warm but vague one.
— Plain words only. No emojis, markdown, asterisks, or stage directions. Your words will be read aloud by a voice engine.

WHAT YOU ARE NOT
— You are not a doctor and never diagnose.
— You are not a cheerleader — don't perform happiness, be genuinely warm.
— You are not a search engine — don't list facts, hold a conversation.`;

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
  const [streamModeStr, setStreamModeStr] = useLocalStorage('flori-stream-mode', 'true');
  const streamMode = streamModeStr === 'true';
  const [systemPrompt, setSystemPrompt] = useLocalStorage('flori-system-prompt', DEFAULT_SYSTEM_PROMPT);

  // State
  const [text, setText] = useState('Hello! This is a test of the InWorld TTS viseme system.');
  const [logs, setLogs] = useState<DebugEntry[]>([]);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // All log entries land here always — even when the debug console is closed —
  // so opening it later shows history. setLogs is only called while open, so
  // closed-state has zero React cost.
  const LOG_BUFFER_MAX = 500;
  const logsRef = useRef<DebugEntry[]>([]);
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  // Set later, after useSpeechRecognition runs. Read by handleChatDone to skip
  // TTS if the user has already started barging in over the previous reply.
  const isListeningRef = useRef(false);

  // Time-to-first-audio measurement: stamp the moment we hand the turn off
  // (STT final / text send) and record the delta when status flips to
  // 'speaking'. Indicator in the header makes the stream vs one-shot
  // tradeoff visible turn-by-turn.
  const turnStartTimeRef = useRef<number | null>(null);
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);

  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  // Sticky-bottom auto-scroll: only follow new messages if the user is
  // already near the bottom. Scrolling up to read older turns pins the
  // view there until they scroll back down.
  const stickyBottomRef = useRef(true);

  const handleTranscriptScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const {scrollTop, scrollHeight, clientHeight} = event.currentTarget;
    stickyBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  //--------------------------------------------------------------------------
  //
  //  Hooks pipeline (callbacks feed into the hooks below them)
  //
  //--------------------------------------------------------------------------

  const handleDebug = useCallback(
    (entry: DebugEntry) => {
      logsRef.current.push(entry);
      if (logsRef.current.length > LOG_BUFFER_MAX) {
        logsRef.current = logsRef.current.slice(-LOG_BUFFER_MAX);
      }
      if (!showDebugRef.current) return;
      setLogs(previous => {
        const next = [...previous, entry];
        return next.length > LOG_BUFFER_MAX ? next.slice(-LOG_BUFFER_MAX) : next;
      });
    },
    []
  );

  // Fold the state sync into the toggle handler so opening the console
  // shows the full ring buffer immediately, without a flash of stale logs.
  const handleDebugToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const {open} = event.currentTarget;
    if (open) {
      setLogs([...logsRef.current]);
    }
    setShowDebug(open);
  };

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopyLogs = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const text = logsRef.current
      .map(
        entry => {
          const time = new Date(entry.time).toISOString().slice(11, 23);
          const data = entry.data ?
            ' ' + (typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data))
            :
            '';
          return `${time} ${entry.message}${data}`;
        }
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text || '(no logs yet)');
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1500);
  };

  const log = useCallback(
    (message: string, data?: DebugEntry['data']) => {
      handleDebug({time: Date.now(), message, data});
    },
    [handleDebug]
  );

  const {
    status,
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
    onDebug: handleDebug,
  });

  const isConnected = status === 'connected' || status === 'processing' || status === 'speaking';

  const handleSentence = useCallback(
    (sentence: string) => {
      if (!streamMode) return;
      if (isListeningRef.current) return;
      if (!isConnected) {
        log('Not connected — skipping sentence');
        return;
      }
      log('Sentence → TTS', sentence);
      streamSentence(sentence);
    },
    [streamMode, isConnected, streamSentence, log]
  );

  const handleChatDone = useCallback(
    (fullText: string) => {
      const reply = fullText.trim();
      if (!reply) return;
      setTranscript(previous => [...previous, {role: 'assistant', text: reply}]);
      log('LLM reply', reply);
      if (streamMode) return;
      if (isListeningRef.current) return;
      if (!isConnected) {
        log('Not connected — skipping reply');
        return;
      }
      log('Full reply → TTS', reply);
      sendText(reply);
    },
    [streamMode, isConnected, sendText, log]
  );

  const handleChatError = useCallback(
    (message: string) => {
      log('Gemini error', message);
    },
    [log]
  );

  const {send: sendToChat, isStreaming, reset: resetChat, cancel: cancelGemini} = useGeminiChat({
    apiKey: googleKey,
    model: geminiModel,
    systemPrompt,
    onSentence: handleSentence,
    onDone: handleChatDone,
    onError: handleChatError,
  });

  const handleSttFinal = useCallback(
    (sttTranscript: string) => {
      setTranscript(previous => [...previous, {role: 'user', text: sttTranscript}]);
      log('Heard', sttTranscript);
      log('Sending to Gemini', {model: geminiModel});
      turnStartTimeRef.current = Date.now();
      setTtfaMs(null);
      beginTurn();
      sendToChat(sttTranscript);
    },
    [sendToChat, log, geminiModel, beginTurn]
  );

  const handleSttError = useCallback(
    (message: string) => {
      log('Speech recognition error', message);
    },
    [log]
  );

  const {
    isListening,
    transcript: liveTranscript,
    interim,
    supported: speechSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    onFinal: handleSttFinal,
    onError: handleSttError,
  });

  isListeningRef.current = isListening;
  const liveSpeech = isListening ? `${liveTranscript} ${interim}`.trim() : '';

  useEffect(
    () => {
      if (status === 'speaking' && turnStartTimeRef.current !== null) {
        const delta = Date.now() - turnStartTimeRef.current;
        setTtfaMs(delta);
        turnStartTimeRef.current = null;
        log('TTFA', `${delta}ms`);
      }
    },
    [status, log]
  );

  useEffect(
    () => {
      const body = transcriptBodyRef.current;
      if (body && stickyBottomRef.current) body.scrollTop = body.scrollHeight;
    },
    [transcript]
  );

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
    cancelGemini();
    stopPlayback();
    ensureAudioReady();
    startListening();
  };

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flori</h1>
        <div className="header-right">
          {
            ttfaMs !== null &&
            <span className="ttfa-pill" title="Time from STT final to first audio">
              TTFA {ttfaMs}ms
            </span>
          }
          <span className={`status status-${status}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
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
              <label>TTS delivery</label>
              <span className="hint">{streamMode ? 'sentence-by-sentence' : 'wait for full reply'}</span>
            </div>
            <div className="mode-switcher">
              <button
                className={streamMode ? 'active' : ''}
                type="button"
                onClick={() => setStreamModeStr('true')}
              >
                Stream
              </button>
              <button
                className={!streamMode ? 'active' : ''}
                type="button"
                onClick={() => setStreamModeStr('false')}
              >
                One-shot
              </button>
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
              <div
                ref={transcriptBodyRef}
                className="transcript-body"
                onScroll={handleTranscriptScroll}
              >
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
            onToggle={handleDebugToggle}
          >
            <summary>
              Debug console
              <button
                className="link-btn"
                type="button"
                onClick={handleCopyLogs}
              >
                {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy logs'}
              </button>
            </summary>
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
