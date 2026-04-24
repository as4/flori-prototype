# Flori Prototype

Flori is a warm voice companion shaped like a battery, designed to live inside a women's health app. She listens and reflects rather than diagnoses — fluent in cycles, hormones, PCOS, endometriosis, fertility, perimenopause, and how everyday wellbeing (sleep, mood, stress) connects to all of it. This repo is the prototype that validates the full voice + lip-sync pipeline; the app she'll ship inside is built separately.

Push the mic button, speak, and Flori replies with synced lip-sync animation.

## Pipeline

```
[Mic] ─Web Speech API─► transcript
        ─► Google AI Studio (Gemini) ─► reply text
        ─► InWorld TTS WebSocket ─► audio + phoneme/viseme timestamps
        ─► Rive state machine (mouth) + audio playback
```

- **STT**: browser Web Speech API (free, on-device).
- **LLM**: direct Google AI Studio (`gemini-2.5-flash-lite` by default; the model is editable in the UI). Has a real free tier — no cost at demo volume.
- **TTS + visemes**: InWorld TTS WebSocket. Returns IPA phonemes with viseme symbols and millisecond timing — the only viable way we found to get accurate lip-sync. Mini and Max models are both selectable in the UI; defaults to Mini.
- **Animation**: a Rive `.riv` file (the artist's battery character) ships in `public/riv/flori.riv` and loads automatically. UI lets you switch between Rive / Emoji / SVG mouth display.

## Why not InWorld Realtime / ElevenLabs Agents / etc.

The original demo used ElevenLabs, which only returns character-level timing (h, i, l, l) — that's not enough to drive accurate lip-sync. InWorld's TTS WebSocket is the cheapest path we found that returns *real* phoneme timing. Speech-to-speech APIs (InWorld Realtime, OpenAI Realtime, ElevenLabs Conversational) are faster (300–800 ms vs ~1.5 s for our 3-stage pipeline) but they don't expose phoneme data, so lip-sync would degrade back to the ElevenLabs problem.

## Viseme mapping

InWorld returns viseme symbols; we map each to a numeric ID that drives the Rive state machine's `visemeId` input.

| ID | Viseme       | Mouth shape          |
|----|--------------|----------------------|
| 0  | sil          | Neutral/closed       |
| 1  | aei          | Open mouth           |
| 2  | o            | Rounded              |
| 3  | ee           | Wide/smile           |
| 4  | bmp          | Lips together        |
| 5  | fv           | Bottom lip to teeth  |
| 6  | l            | Tongue tip up        |
| 7  | r            | Tongue retracted     |
| 8  | th           | Tongue between teeth |
| 9  | qw           | Lips pursed          |
| 10 | cdgknstxyz   | Closed/neutral       |

## Setup

```bash
npm install
npm run dev
```

`npm run dev` serves over HTTPS on the local network (via `@vitejs/plugin-basic-ssl`) so iOS Safari is willing to grant mic access. Open the `Network:` URL on your phone, accept the self-signed cert warning, and you can test the full pipeline on a real device.

In the UI, paste:
- An **InWorld API key** for TTS (platform.inworld.ai)
- A **Google AI Studio key** for the LLM (aistudio.google.com — free tier covers all demo traffic)

Both keys live in `localStorage`; nothing is sent anywhere except their respective APIs.

## Deploy (Cloudflare Pages)

```bash
npm run deploy
```

## Docs

- [`docs/architecture.md`](docs/architecture.md) — system overview and design rationale
- [`docs/rive-setup-guide.md`](docs/rive-setup-guide.md) — artist-facing guide for the Rive file (mouth visemes + emotion animations)
- [`docs/inworld-api-research.md`](docs/inworld-api-research.md) — InWorld API reference notes

## Known limitations

- API keys live in the browser. A Cloudflare Worker proxy to hide them is a planned follow-up.
- Time-to-first-audio is ~1–1.5 s on the voice path (STT → LLM → TTS). Acceptable for a demo; not as snappy as a true speech-to-speech model.
- iOS pre-17.2 Safari can mute Web Audio when the silent switch is on. Newer iOS uses `audioSession.type = 'playback'` which bypasses this.
- Web Speech API on iOS Safari is flaky on some versions — the iPhone needs *Settings → General → Keyboard → Enable Dictation* turned on or recognition fails with a permission error.
