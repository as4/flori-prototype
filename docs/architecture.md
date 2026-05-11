# Architecture & Technical Decisions

## What Flori is

Flori is a voice companion living inside a women's health app — a warm, emotionally intelligent character shaped like a battery that holds short, caring conversations about cycles, hormones, PCOS, endometriosis, fertility, perimenopause, PMS, sleep, mood, stress, and general wellbeing. The prototype in this repo validates the full voice + lip-sync pipeline end-to-end; the product it'll ship inside is being built separately.

The entire pipeline runs client-side against three third-party APIs (Google AI Studio, InWorld TTS, browser's Web Speech API). No backend yet.

## Pipeline

```
┌──────┐  webkitSpeechRecognition
│  Mic │ ──────────────────────────► transcript
└──────┘

                    Gemini (Google AI Studio, SSE)
transcript ─────────────────────────────────────► streamed reply text

                    InWorld TTS WebSocket
reply text ─────────────────────────────────────► audio chunks + phoneme/viseme timestamps

                    Web Audio API + RAF loop
audio + timestamps ─────────────────────────────► speaker output + Rive state-machine visemeId input
```

**STT** — `webkitSpeechRecognition` in the browser. Free, on-device, no account needed. Desktop Safari + Chrome work; iOS Safari works if Dictation is enabled in system settings.

**LLM** — Google AI Studio, `gemini-2.5-flash-lite` by default. Called directly from the browser (CORS is open on `generativelanguage.googleapis.com`). The request is streamed with `alt=sse`; we accumulate tokens and fire one `onDone` with the full reply at end-of-turn. Gemini Flash-Lite has a real free tier covering all demo traffic.

**Latency tuning — model "thinking" / "reasoning" disabled across all three adapters.** Gemini sets `thinkingConfig.thinkingBudget = 0` (works on 2.5 Flash + Flash-Lite; 2.5 Pro would 400, swap if you switch). OpenAI sends `reasoning_effort: 'minimal'` (effective on GPT-5.x; ignored by 4o family). OpenRouter sends `reasoning: {enabled: false, exclude: true}` to suppress reasoning where the underlying provider supports it and strip leaked `<think>` blocks where it doesn't. Short conversational replies don't benefit from reasoning tokens; we trade them for TTFT.

**TTS + visemes** — InWorld TTS WebSocket (`wss://api.inworld.ai/tts/v1/voice:streamBidirectional`). Returns MP3 audio chunks plus `timestampInfo.wordAlignment.phoneticDetails` — per-word arrays of phones with `visemeSymbol`, `startTimeSeconds`, `durationSeconds`. Model is selectable in the UI between `inworld-tts-1.5-mini` (default) and `inworld-tts-1.5-max`.

**Animation** — Rive 2D character via `@rive-app/canvas`. The artist's `.riv` file lives at `public/riv/flori.riv` and auto-loads on mount. A fixed-size stage (`.character-stage`, 400×400) prevents layout shift when the user toggles between Rive / Emoji / SVG display modes. The state machine takes two Number inputs we drive: `visemeId` (lip-sync, every frame) and `emotionId` (facial expression, per sentence — see *Emotion* below).

## Why this stack

### Why not ElevenLabs (original prototype)
ElevenLabs gives **character-level timing** — each letter gets a timestamp. Fundamentally broken for lip-sync:
- Letters ≠ phonemes: "hi" and "hill" both have "i" but different mouth shapes (/aɪ/ vs /ɪ/).
- Double letters ("ll") create duplicate events that don't map to actual mouth movements.
- Post-processing with `phonemizer` fails in Safari and can't reliably map letter timings to phoneme timings — different counts, different durations.

### Why not speech-to-speech APIs (InWorld Realtime, OpenAI Realtime, ElevenLabs Conversational)
They're faster end-to-end (300–800 ms vs our ~1.5 s) because audio is generated alongside the LLM response without a text hop. But **none expose phoneme or viseme data**. We'd be back to the ElevenLabs problem — fake lip-sync. The 3-stage STT → LLM → TTS pipeline is the price we pay for real phoneme timing.

### Why direct Google AI Studio instead of InWorld's LLM router
InWorld's chat-completions endpoint proxies to the same Gemini models but forfeits Google's free tier — they bill at the paid per-token rate. Direct Google AI Studio is genuinely $0 at prototype volume. Trade-off: two API keys in the UI instead of one. Both live in localStorage.

## Data flow

1. **Page load** — the bundled `.riv` is fetched in a `useEffect` and handed to the Rive runtime. `AudioContext` is *not* created yet (needs a user gesture).
2. **User presses Connect** — `useInworldTTS.connect()` opens the WebSocket, sends the `create` message (voice, model, audio config), and also creates the `AudioContext` and primes it with a 1-sample silent buffer. The silent-buffer primer fires **once per session** (guarded by `audioPrimedRef`) — replaying it on every PTT press collides with iOS SFSpeechRecognizer ("Source is stopped"). `navigator.audioSession.type = 'playback'` is also set here so iOS 17.2+ ignores the physical silent switch.
3. **User holds mic** — `useSpeechRecognition.start()` runs. On Chrome we pre-request mic via `getUserMedia` (Chrome needs it); on Safari we skip that (Safari manages its own flow and `getUserMedia` conflicts with it).
4. **User releases mic** — recognition emits final (or interim fallback on Safari) transcript via `onFinal`.
5. **App dispatches to the LLM** — `useLLMChat.send(transcript)` calls the active adapter (Google / OpenAI / OpenRouter). Tokens arrive as SSE events; the adapter parses provider-specific deltas and feeds plain text chunks back via `onChunk`. `useLLMChat` runs the chunk through the emotion-tag stripper, accumulates `fullText` (cleaned) + `rawText` (with tags), and flushes per-sentence to `onSentence(sentence, emotion?)`.
6. **On stream end** — `onDone(fullText)` fires. We push the reply into the transcript state and call `sendText(reply)` on the TTS hook.
7. **TTS streams chunks** — `audioChunk` messages arrive with audio + `phoneticDetails`. We buffer chunks and accumulate a viseme timeline.
8. **Flush completed** — all chunks received. We concatenate, `decodeAudioData`, and `source.start(0)`.
9. **Viseme sync** — a RAF loop compares `audioContext.currentTime` against the pre-sorted timeline, setting `currentViseme` when it changes. A 150ms hold after each phoneme end stops flickering into silence between close-together phonemes.
10. **Rive drives the mouth** — `RiveCharacter` watches `currentViseme`, maps to `VISEME_TO_ID[currentViseme]`, and writes to the `visemeId` state-machine input.

## File structure

```
public/riv/flori.riv            — bundled Rive character (artist drops updates here)
src/
  hooks/
    useLocalStorage.ts          — persist config to localStorage
    useSpeechRecognition.ts     — webkitSpeechRecognition wrapper with Safari-specific workarounds
    useLLMChat.ts               — provider-agnostic chat loop, sentence flushing, inline-tag stripping
    useInworldSocket.ts         — InWorld TTS WebSocket connection + per-sentence streaming
    useAudioPlayback.ts         — Web Audio decode + scheduling, viseme RAF loop, onSegmentStart hook
    useInworldTTS.ts            — composes Inworld socket + audio playback, exposes connect/streamSentence/sendText
  llm/
    adapter.ts                  — LLMAdapter interface (id, label, stream)
    providers.ts                — provider registry + DEFAULT_LLM_PROVIDER, useLLMProviders hook
    google/                     — Gemini SSE adapter
    openai/                     — OpenAI chat-completions SSE adapter
    openrouter/                 — OpenRouter SSE adapter (OpenAI-compatible)
  components/
    PushToTalkButton.tsx        — mic button with pointer + spacebar support and iOS pointer-capture
    RiveCharacter.tsx           — slim production .riv loader, drives visemeId + emotionId
    RiveCharacterDev.tsx        — dev wrapper: file-picker, mode switcher, manual emotion buttons, LLM-driven toggle
    VisemeFallback.tsx          — emoji + SVG mouth shapes driven by currentViseme
    Transcript.tsx              — conversation panel, sticky-bottom auto-scroll
    PersonaEditor.tsx           — system prompt textarea + reset
    LLMConfig.tsx + ProviderField.tsx — provider selector + per-provider API key/model inputs
    TTSConfig.tsx               — InWorld API key, voice, model, stream-mode toggle
    SecretInput.tsx             — API-key input with masked text-security
    TextDebugInput.tsx          — typed-text fallback path with TTFA pill
    DebugPanel.tsx              — collapsible debug-console wrapper, copy-logs button
    DebugConsole.tsx            — timestamped event log, scroll-to-bottom
  utils/
    log.ts                      — module-level ring buffer + EventTarget for useSyncExternalStore consumers
  emotions.ts                   — EMOTION_TO_ID, EmotionName, EMOTIONS array (shared by dev wrapper + tag stripper)
  config.ts                     — DEFAULT_RIV_URL, TTS_MODELS, DEFAULT_TTS_MODEL
  App.tsx                       — wires the pipeline, persona, latency pills, emotion queue
  App.css / index.css           — dark theme, mobile-safe layout
vite.config.js                  — @vitejs/plugin-basic-ssl for LAN HTTPS (needed for iOS mic)
```

## Viseme mapping

InWorld provides 10 viseme categories. We add `sil` (silence) as ID 0:

| ID | Symbol | Mouth shape | Example sounds |
|----|--------|-------------|----------------|
| 0 | sil | Closed/neutral | (silence, pauses) |
| 1 | aei | Open wide | "ah", "eh", "uh" |
| 2 | o | Rounded | "oh", "oo" |
| 3 | ee | Wide/smile | "ee", "ih" |
| 4 | bmp | Lips pressed | "b", "m", "p" |
| 5 | fv | Lip to teeth | "f", "v" |
| 6 | l | Tongue up | "l" |
| 7 | r | Tongue back | "r" |
| 8 | th | Tongue out | "th" |
| 9 | qw | Pursed | "w", "qu" |
| 10 | cdgknstxyz | Slightly open | "d", "g", "k", "n", "s", "t" |

The Rive state machine takes a Number input named `visemeId` (configurable in the UI if the artist uses a different name).

## Emotion

Flori has facial expressions that change per sentence — driven by the LLM, in lockstep with the audio. Toggleable from the dev wrapper (`☐ LLM-driven emotion` checkbox); when off, manual buttons (Listening / Empathetic / Happy / Curious / Surprise) drive `emotionId` directly.

**Five emotion IDs** (canonical, defined in `src/emotions.ts`):

| ID | Name |
|----|--------|
| 0 | Listening (default rest state) |
| 1 | Empathetic |
| 2 | Happy |
| 3 | Curious |
| 4 | Surprise |

The Rive state machine takes a Number input named `emotionId` and switches state set on value change. Missing input is non-fatal — visemes keep working.

### How LLM-driven emotion works

When the toggle is on, an `EMOTION_PROMPT_ADDENDUM` is appended to the system prompt instructing Gemini to begin each sentence with one of `[LISTENING]`, `[EMPATHETIC]`, `[HAPPY]`, `[CURIOUS]`, `[SURPRISE]`. Mid-reply changes are explicitly allowed (e.g. `[EMPATHETIC] That sounds hard. [CURIOUS] When did it start?`).

**Why inline tags, not JSON structured output:** structured output (`responseMimeType: 'application/json'` + schema) breaks the existing sentence-stream-to-TTS pipeline and forces per-adapter request changes. Inline tags keep the streaming text path identical, work across all three LLM adapters with no adapter changes, and naturally support mid-reply switches.

**Tag binding** (in `useLLMChat.ts`):
- A small streaming parser walks each chunk for `[TAG]` sequences. Recognised tags are stripped from the output text and stash a `pendingEmotion`. Unrecognised brackets pass through as plain text.
- Chunk-boundary safety: if a `[…` fragment lands at the end of a chunk without a closing `]`, it's held in `leftover` (capped at 24 chars to bound stray-`[` cases) and prepended to the next chunk.
- When a sentence terminator (`.!?`) flushes a sentence, the current `pendingEmotion` is attached to that sentence and cleared. Multiple tags before a flush — last one wins.
- The cleaned text feeds the existing `onSentence` / `onDone` callbacks; tags never reach TTS audio. A separate `rawText` accumulator (with tags intact) is kept for chat history and the transcript display, so the LLM sees its own emotional through-line on the next turn and the user can verify what was emitted.

**Sentence → audio sync** (the hard part — see commit ce6 / project memory):
- The LLM emits all tags within ~150ms; audio for the same reply plays for ~5s. Applying emotion at tag-arrival lands every change instantly and desyncs face from voice.
- `App.tsx` keeps a `pendingEmotionsRef` queue. `handleSentence` pushes the emotion onto the queue and hands the sentence text to TTS — no immediate state change.
- `useAudioPlayback` exposes an `onSegmentStart` callback. Web Audio has no native per-source `onstart`, so each `source.start(startAt)` is mirrored with a `setTimeout` firing at the same `audioContext` timestamp. Cancellation (`cancel()` / barge-in) clears the pending timers.
- When `onSegmentStart` fires for sentence N, `App` shifts the front of the emotion queue and applies it via `setCurrentEmotion`. Net result: face change lands the same instant Flori's voice for that sentence starts.
- After the last segment ends (`status` leaves `speaking`), an effect resets `currentEmotion` to `0` (listening) — only when the LLM-driven toggle is on, so manual selections persist when off.

**Granularity:** one sentence = one emotion. Mid-sentence tag changes are not supported — once a sentence is one TTS payload, it's one chunk of audio with one emotion. Splitting sub-sentences would create unnatural prosody since TTS sees fragments instead of full sentences.

## iOS / Safari workarounds

Most of the subtle bugs on this project came from iOS Safari. Documented here so they don't get re-discovered:

- **`webkitSpeechRecognition` permission ≠ mic permission.** macOS requires Speech Recognition enabled in System Settings > Privacy & Security. iOS requires Dictation enabled in Settings > General > Keyboard. Both fire "Speech recognition service permission check has failed" without a prompt when disabled.
- **Don't pre-fetch `getUserMedia` on Safari before `webkitSpeechRecognition.start()`** — it conflicts with Safari's internal permission flow and surfaces as the service-permission error. Chrome, conversely, *needs* the pre-fetch to trigger its mic prompt.
- **Safari often ends speech recognition without emitting `isFinal` results** when `stop()` is called mid-utterance (push-to-talk always does this). We keep the latest interim in a ref and fall back to it in `onend`.
- **`AudioContext` user-gesture window is short (~1 s).** Creating/resuming lazily inside an async handler that runs long after the originating click silently stalls on Safari. We create + resume + prime inside `connect()` (synchronous click handler) and reuse the context.
- **iOS needs a silent-buffer `source.start(0)` during the gesture** to actually unlock WebAudio output — `resume()` alone isn't enough. But replaying the silent buffer on every subsequent press collides with `SFSpeechRecognizer` and triggers "Source is stopped", so we guard with `audioPrimedRef` and only prime once.
- **iOS physical silent switch mutes WebAudio** (unlike HTML5 `<audio>`). `navigator.audioSession.type = 'playback'` (Safari 17.2+) opts into music-app semantics and overrides the switch. Older iOS would need an HTML `<audio>` element fallback.
- **iOS Simulator `SFSpeechRecognizer` is broken** and surfaces "Source is stopped". Always test speech recognition on a real device.
- **`webkitSpeechRecognition` start-up latency is variable on iOS** — usually 5–30 ms from `start()` to `onstart`, but ~10% of presses (in informal testing) take **~600 ms**. No correlation with idle time, audio-session state, or prior playback duration. Likely iOS releasing the `SFSpeechRecognizer` backend on idle and re-acquiring it cold. We accept the variance for now; if it becomes a UX problem, two mitigations to try: (a) reuse a single long-lived `webkitSpeechRecognition` instance instead of `new Ctor()` per press (today's `useSpeechRecognition.start()` creates fresh each time, forcing cold init), (b) a no-op warm-up `start()` → `stop()` at first user interaction to wake the recognizer.
- **Mic/Speech APIs require HTTPS.** `npm run dev` uses `@vitejs/plugin-basic-ssl` so the LAN URL is HTTPS — self-signed cert warning on first visit, then it works.
- **PTT button tap-hold on iOS**: we call `setPointerCapture` on `pointerdown` and *don't* listen for `pointerleave` (OS callout fires it during long-press). `onContextMenu={preventDefault}` + `-webkit-touch-callout: none` block the system callout.
- **Password-manager prompts on API-key inputs** — dropping `type="password"` and masking with `-webkit-text-security: disc` stops Safari's save prompt.

## Known limitations

- API keys live in the browser. A Cloudflare Worker proxy is the planned path to hide them in production.
- Sentence streaming (LLM → TTS) splits on `[.!?]\s` in `useLLMChat.ts`. Honorifics and abbreviations like "Dr. Smith" or "Mr. Brown" produce a false split and an audible pause between names. See *Future work — LLM-emitted sentence markers* below for the planned fix.
- **Full conversation history is sent on every LLM call.** `useLLMChat`'s `historyRef` accumulates every user/assistant turn for the session and the entire array is included in each request. Linear growth in tokens, TTFT, and per-call cost. At ~150 tokens per turn (STT result + 2–3-sentence reply), this is fine for short demos but starts being felt past ~30 turns on smaller models (Ministral 8B, gpt-4o-mini). Switching providers mid-conversation also keeps the same history (correct, but worth noting because a model swap makes the cost jump on the new provider's first call). Three options if it becomes a problem — picked roughly in order of ambition:
  1. **Sliding window** — cap at the last N turns. Trivial, loses long-term context. Bad for Flori specifically because the persona is built on remembering what the user shared (cycle issues, conditions).
  2. **Token budget** — same idea, counted in tokens. Marginally smarter, same downside.
  3. **Periodic summarisation** — when history exceeds N turns, do an LLM call that condenses older turns into a single synthetic message (system or assistant) and replaces them. Preserves the *facts* without the transcript. Costs one extra call every M turns. The right answer for Flori long-term.
- **Prompt caching is not used.** Anthropic and recent OpenAI models support caching the long prefix (system prompt + early history) so subsequent turns are cheaper and lower-TTFT. OpenRouter passes this through for supported models. We don't enable it. Worth flipping on alongside option 3 above.
- InWorld TTS doesn't always expand abbreviations (e.g. "TTS" → "ts" instead of "tee tee ess"). Not fixable client-side.
- iOS pre-17.2: WebAudio can be silent-switch-muted.

## Future work

- **Key-hiding Worker proxy** — Cloudflare Worker that holds both API keys server-side and forwards requests; frontend just talks to the Worker.
- **LLM-emitted sentence markers** — replaces the regex-based sentence splitter in `useLLMChat.ts`. Add a directive to the system prompt: "End every sentence with the character `‖` (U+2016). Never use this character anywhere else, and never include it inside numbers, names, abbreviations, or quotations." Then split on `‖` instead of `[.!?]\s`, and strip the marker before passing text to `onSentence`/`onDone`/the transcript. Pros: solves the "Dr. Smith" false-split problem, handles ellipses and decimals correctly, and lets the LLM choose semantic clause breaks (e.g. dramatic comma pauses). Cons: small extra tokens per sentence, and weaker models occasionally drop the marker — keep the regex split as a fallback for stretches with no marker.
