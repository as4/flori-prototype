import {useState, useCallback, useEffect, useRef} from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import useInworldTTS from './hooks/useInworldTTS';
import useLLMChat from './hooks/useLLMChat';
import useSpeechRecognition from './hooks/useSpeechRecognition';
import RiveCharacterDev from './components/RiveCharacterDev';
import PushToTalkButton from './components/PushToTalkButton';
import DebugPanel from './components/DebugPanel';
import LLMConfig from './components/LLMConfig';
import TTSConfig from './components/TTSConfig';
import Transcript, {type TranscriptTurn} from './components/Transcript';
import PersonaEditor from './components/PersonaEditor';
import EmotionPromptEditor from './components/EmotionPromptEditor';
import TextDebugInput from './components/TextDebugInput';
import {DEFAULT_LLM_PROVIDER, useLLMProviders} from './llm/providers';
import type {LLMProviderId} from './llm/providers';
import {DEFAULT_TTS_MODEL} from './config';
import {EMOTION_TO_ID, type EmotionName} from './emotions';
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

const DEFAULT_EMOTION_PROMPT = `EMOTION TAGS
— Begin each sentence with one of these tags so Flori's face matches the moment: [LISTENING], [EMPATHETIC], [HAPPY], [CURIOUS], [SURPRISE].
— Use [EMPATHETIC] when the user shares something painful, [CURIOUS] when you're about to ask a follow-up, [HAPPY] for warm uplifting moments, [SURPRISE] for a small "oh!", and [LISTENING] as the calm default.
— You can change emotion mid-reply when the tone shifts — e.g. a soft acknowledgement followed by a curious question.
— Tags are stripped before the user hears the reply — never refer to them in the spoken text.`;

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

  // State
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState(0);

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

  // Per-sentence emotion queue. Pushed at handleSentence (when each sentence
  // is queued to TTS); shifted at handleSegmentStart (when the matching audio
  // actually starts playing). The LLM emits all sentence tags within a few
  // hundred ms but audio plays for seconds — applying on tag-arrival lands
  // every change instantly and desyncs face from voice.
  const pendingEmotionsRef = useRef<(EmotionName | undefined)[]>([]);

  const handleSegmentStart = useCallback(
    () => {
      const next = pendingEmotionsRef.current.shift();
      if (next) {
        setCurrentEmotion(EMOTION_TO_ID[next]);
        log('Emotion', next);
      }
    },
    []
  );

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
    onSegmentStart: handleSegmentStart,
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
      pendingEmotionsRef.current.push(emotion);
      log('Sentence → TTS', sentence);
      streamSentence(sentence);
    },
    [streamMode, isConnected, streamSentence]
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
      pendingEmotionsRef.current = [];
      beginTurn();
      sendToChat(sttTranscript);
    },
    [sendToChat, activeLLM.id, beginTurn]
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
    [status]
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

  const handleResetChat = () => {
    resetChat();
    setTranscript([]);
    log('Conversation reset');
  };

  const handlePttStart = () => {
    cancelLLM();
    stopPlayback();
    pendingEmotionsRef.current = [];
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
        </div>

        <div className="panel panel-controls">
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
