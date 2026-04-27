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

**TTS + visemes** — InWorld TTS WebSocket (`wss://api.inworld.ai/tts/v1/voice:streamBidirectional`). Returns MP3 audio chunks plus `timestampInfo.wordAlignment.phoneticDetails` — per-word arrays of phones with `visemeSymbol`, `startTimeSeconds`, `durationSeconds`. Model is selectable in the UI between `inworld-tts-1.5-mini` (default) and `inworld-tts-1.5-max`.

**Animation** — Rive 2D character via `@rive-app/canvas`. The artist's `.riv` file lives at `public/riv/flori.riv` and auto-loads on mount. A fixed-size stage (`.character-stage`, 400×400) prevents layout shift when the user toggles between Rive / Emoji / SVG display modes.

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
5. **App dispatches to Gemini** — `useGeminiChat.send(transcript)` POSTs to `generativelanguage.googleapis.com/.../streamGenerateContent?alt=sse`. Tokens arrive as SSE events; we parse `candidates[0].content.parts[*].text` and accumulate into `fullText`.
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
    useInworldTTS.ts            — TTS WebSocket, audio playback, viseme RAF loop, iOS audio unlocks
    useGeminiChat.ts            — Gemini streamGenerateContent SSE reader, multi-turn memory
    useSpeechRecognition.ts     — webkitSpeechRecognition wrapper with Safari-specific workarounds
  components/
    PushToTalkButton.tsx        — mic button with pointer + spacebar support and iOS pointer-capture
    RiveCharacter.tsx           — .riv loader, 3-way display switcher (Rive/Emoji/SVG)
    VisemeFallback.tsx          — emoji + SVG mouth shapes driven by currentViseme
    DebugConsole.tsx            — collapsible timestamped event log
  config.ts                     — DEFAULT_RIV_URL, TTS_MODELS
  App.tsx                       — wires the pipeline, persona textarea, debug toggle
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

## iOS / Safari workarounds

Most of the subtle bugs on this project came from iOS Safari. Documented here so they don't get re-discovered:

- **`webkitSpeechRecognition` permission ≠ mic permission.** macOS requires Speech Recognition enabled in System Settings > Privacy & Security. iOS requires Dictation enabled in Settings > General > Keyboard. Both fire "Speech recognition service permission check has failed" without a prompt when disabled.
- **Don't pre-fetch `getUserMedia` on Safari before `webkitSpeechRecognition.start()`** — it conflicts with Safari's internal permission flow and surfaces as the service-permission error. Chrome, conversely, *needs* the pre-fetch to trigger its mic prompt.
- **Safari often ends speech recognition without emitting `isFinal` results** when `stop()` is called mid-utterance (push-to-talk always does this). We keep the latest interim in a ref and fall back to it in `onend`.
- **`AudioContext` user-gesture window is short (~1 s).** Creating/resuming lazily inside an async handler that runs long after the originating click silently stalls on Safari. We create + resume + prime inside `connect()` (synchronous click handler) and reuse the context.
- **iOS needs a silent-buffer `source.start(0)` during the gesture** to actually unlock WebAudio output — `resume()` alone isn't enough. But replaying the silent buffer on every subsequent press collides with `SFSpeechRecognizer` and triggers "Source is stopped", so we guard with `audioPrimedRef` and only prime once.
- **iOS physical silent switch mutes WebAudio** (unlike HTML5 `<audio>`). `navigator.audioSession.type = 'playback'` (Safari 17.2+) opts into music-app semantics and overrides the switch. Older iOS would need an HTML `<audio>` element fallback.
- **iOS Simulator `SFSpeechRecognizer` is broken** and surfaces "Source is stopped". Always test speech recognition on a real device.
- **Mic/Speech APIs require HTTPS.** `npm run dev` uses `@vitejs/plugin-basic-ssl` so the LAN URL is HTTPS — self-signed cert warning on first visit, then it works.
- **PTT button tap-hold on iOS**: we call `setPointerCapture` on `pointerdown` and *don't* listen for `pointerleave` (OS callout fires it during long-press). `onContextMenu={preventDefault}` + `-webkit-touch-callout: none` block the system callout.
- **Password-manager prompts on API-key inputs** — dropping `type="password"` and masking with `-webkit-text-security: disc` stops Safari's save prompt.

## Known limitations

- API keys live in the browser. A Cloudflare Worker proxy is the planned path to hide them in production.
- Sentence streaming (Gemini → TTS) splits on `[.!?]\s` in `useGeminiChat.ts`. Honorifics and abbreviations like "Dr. Smith" or "Mr. Brown" produce a false split and an audible pause between names. See *Future work — LLM-emitted sentence markers* below for the planned fix.
- InWorld TTS doesn't always expand abbreviations (e.g. "TTS" → "ts" instead of "tee tee ess"). Not fixable client-side.
- iOS pre-17.2: WebAudio can be silent-switch-muted.

## Future work

- **Emotion animations** — artist adds an `emotionId` input on the state machine. Driven by structured-output JSON from Gemini (`{emotion: '...', reply: '...'}`). See `docs/rive-setup-guide.md` for the artist side; implementation plan lives in project memory.
- **Key-hiding Worker proxy** — Cloudflare Worker that holds both API keys server-side and forwards requests; frontend just talks to the Worker.
- **LLM-emitted sentence markers** — replaces the regex-based sentence splitter in `useGeminiChat.ts`. Add a directive to the system prompt: "End every sentence with the character `‖` (U+2016). Never use this character anywhere else, and never include it inside numbers, names, abbreviations, or quotations." Then split on `‖` instead of `[.!?]\s`, and strip the marker before passing text to `onSentence`/`onDone`/the transcript. Pros: solves the "Dr. Smith" false-split problem, handles ellipses and decimals correctly, and lets the LLM choose semantic clause breaks (e.g. dramatic comma pauses). Cons: small extra tokens per sentence, and weaker models occasionally drop the marker — keep the regex split as a fallback for stretches with no marker.
