# Architecture & Technical Decisions

## Why InWorld instead of ElevenLabs

The original prototype used ElevenLabs, which provides **character-level timing** only — each letter gets a timestamp. This is fundamentally broken for lip-sync because:

- Characters are not phonemes: "hi" and "hill" both have the letter "i" but different pronunciations (/aɪ/ vs /ɪ/)
- Double letters (like "ll") create duplicate events that don't map to actual mouth movements
- The `phonemizer` library was tried as a workaround but: fails in Safari, works inconsistently in Chrome, and even when it produces correct phonemes there's no reliable way to map character timings to phoneme timings since they have different counts and durations

InWorld TTS API solves this by returning actual IPA phonemes with viseme symbols and millisecond timing directly from the TTS engine — no guessing or post-processing needed.

## Current architecture (TTS only)

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Browser    │ ◄───────────────► │  InWorld TTS API  │
│             │                    │                    │
│  Text input ─┼──── send_text ──► │  Generates audio   │
│             │                    │  + phoneticDetails  │
│  Audio out  ◄┼── audioChunk ──── │  with visemes      │
│  Rive anim  ◄┼── viseme data ── │                    │
└─────────────┘                    └──────────────────┘
```

Everything runs client-side. No backend needed for the current prototype because:
- Users enter their own API key
- InWorld TTS WebSocket accepts auth via query parameter
- Audio decoding and playback use Web Audio API
- Viseme sync uses requestAnimationFrame

## Data flow

1. **Connect** — open WebSocket to `wss://api.inworld.ai/tts/v1/voice:streamBidirectional`
2. **Create context** — configure voice, model (`inworld-tts-1.5-max`), audio format (MP3/48kHz), timestamp settings
3. **Send text** — user types text, sent with `flush_context` to trigger processing
4. **Receive chunks** — multiple `audioChunk` messages arrive, each containing:
   - `audioContent` (base64 MP3)
   - `timestampInfo.wordAlignment.phoneticDetails` — per-word array of phones, each with `phoneSymbol`, `visemeSymbol`, `startTimeSeconds`, `durationSeconds`
5. **Flush completed** — all chunks received, triggers playback
6. **Playback** — all audio chunks concatenated, decoded via `AudioContext.decodeAudioData()`, played via `AudioBufferSourceNode`
7. **Viseme sync** — RAF loop compares `audioContext.currentTime` against pre-sorted viseme timeline, sets current viseme. 150ms hold after each viseme ends to smooth gaps between phonemes.
8. **Rive drive** — `currentViseme` string maps to numeric ID (0-10), sets `visemeInput.value` on the Rive state machine

## File structure

```
src/
  hooks/
    useLocalStorage.ts    — persist API key and voice ID to localStorage
    useInworldTTS.ts       — WebSocket connection, audio playback, viseme timeline sync
  components/
    RiveCharacter.tsx      — .riv file loader, state machine discovery, viseme input driver
    VisemeFallback.tsx     — emoji/SVG placeholder when no .riv loaded
    DebugConsole.tsx       — timestamped event log
  App.tsx                  — main layout, input forms, wiring
  App.css                  — dark theme styles
  index.css                — CSS reset and variables
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

The Rive state machine needs a Number input that receives these IDs.

## Key implementation details

### Audio handling
- Audio chunks arrive as base64 MP3, accumulated in an array
- On flush, all chunks are concatenated into a single `Uint8Array` and decoded as one buffer
- Playback uses `AudioContext` for precise timing — `audioContext.currentTime` is the clock source for viseme sync (more reliable than `performance.now()`)

### Viseme sync loop
- Timeline is pre-sorted by `start` time with `end` pre-computed
- Forward cursor advances through timeline (O(1) per frame vs O(n) reverse scan)
- Redundant `setCurrentViseme` calls are skipped (only updates on change)
- 150ms hold duration after a viseme ends prevents flickering to silence between consecutive phonemes

### Rive integration
- `.riv` file loaded via `FileReader.readAsArrayBuffer()` → `new Rive({ buffer })`
- State machines auto-discovered via `rive.stateMachineNames`
- Viseme input found by name (configurable, default `visemeId`)
- If input not found, error message lists available inputs so the artist knows what to type

## Known limitations

- **Abbreviations**: InWorld sometimes doesn't expand them — "TTS" becomes two phonemes ("t" + "s") instead of "tee tee ess"
- **API key in client**: Acceptable for a prototype/internal tool where users enter their own key, but a production app should proxy through a backend
- **No conversation**: Current prototype is text-to-speech only. Adding AI conversation requires either InWorld Realtime API or a separate LLM

## Future: Adding AI conversation

Three options for making this a conversational agent:

### Option A: InWorld Realtime API
Use InWorld's own conversational AI. Pipe response text to TTS API for visemes.
```
User audio → InWorld Realtime (text-only output) → InWorld TTS (audio + visemes) → Rive
```

### Option B: Any LLM + InWorld TTS
Use Claude, GPT, or any LLM for the AI brain. Most flexible.
```
User audio → STT (Whisper/Deepgram) → LLM → InWorld TTS (audio + visemes) → Rive
```

### Option C: ElevenLabs Agent + InWorld TTS
Keep ElevenLabs for conversation, use InWorld only for TTS.
```
ElevenLabs Agent → response text (discard their audio) → InWorld TTS (audio + visemes) → Rive
```
Downside: double latency since ElevenLabs generates audio you throw away.
