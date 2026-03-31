# Flori Prototype

Animated talking head prototype using InWorld TTS API for real-time viseme/phoneme data + Rive for 2D character animation.

## How it works

1. User enters an InWorld API key and picks a voice (e.g. "Hana")
2. Text is sent to InWorld TTS WebSocket API
3. API returns audio + phonetic details with viseme symbols and timing
4. Audio plays while a RAF loop syncs viseme display to playback
5. Optionally load a `.riv` file to drive a Rive state machine with viseme IDs

## Viseme mapping

| ID | Viseme         | Mouth shape          |
|----|----------------|----------------------|
| 0  | sil            | Neutral/closed       |
| 1  | aei            | Open mouth           |
| 2  | o              | Rounded              |
| 3  | ee             | Wide/smile           |
| 4  | bmp            | Lips together        |
| 5  | fv             | Bottom lip to teeth  |
| 6  | l              | Tongue tip up        |
| 7  | r              | Tongue retracted     |
| 8  | th             | Tongue between teeth |
| 9  | qw             | Lips pursed          |
| 10 | cdgknstxyz     | Closed/neutral       |

## Setup

```bash
npm install
npm run dev
```

## Deploy (Cloudflare Pages)

```bash
npm run build
npx wrangler pages deploy dist
```
