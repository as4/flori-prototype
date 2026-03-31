# InWorld AI API/SDK Research for Web Integration

Research date: 2026-03-31

---

## 1. Connecting to InWorld from a Browser

InWorld offers **two distinct API systems** relevant to web:

### A. Realtime API (Speech-to-Speech WebSocket)

This is their newer API for real-time voice conversations, following the **OpenAI Realtime protocol** schema.

**WebSocket Endpoint:**
```
wss://api.inworld.ai/api/v1/realtime/session?key=<session-id>&protocol=realtime
```

**Authentication:**
- Server-side (Node.js proxy): `Authorization: Basic <base64-api-key>`
- Client-side (browser): `Authorization: Bearer <jwt-token>` (JWT minted on your backend)

**Connection flow:**
1. Open WebSocket connection
2. Receive `session.created` event
3. Send `session.update` to configure model, instructions, audio settings, tools
4. Stream audio via `input_audio_buffer.append` or text via `conversation.item.create`
5. Trigger `response.create` and handle `response.output_*` events

**Rate limits:** 20 concurrent sessions, 1000 packets/sec per account.

**Important:** This API does NOT currently provide viseme/phoneme data. It provides audio + text output only.

### B. TTS API (Text-to-Speech with Viseme/Phoneme Data)

This is a separate API specifically for speech synthesis with timestamp alignment.

**REST Streaming Endpoint:**
```
POST https://api.inworld.ai/tts/v1/voice:stream
```

**WebSocket Endpoint:**
```
wss://api.inworld.ai/tts/v1/voice:streamBidirectional
```

### C. Legacy Web SDK (@inworld/web-core)

An older browser SDK (v2.10.0) for connecting to InWorld characters. Uses its own protocol (likely gRPC-web under the hood). Dependencies include zod, uuid, base64-arraybuffer. This SDK was designed for the older "Simple API" character interaction system.

---

## 2. Viseme/Phoneme Data Format

Viseme and phoneme data come from the **TTS API** (not the Realtime API).

### Enabling Timestamps

Set `timestampType: "WORD"` in your TTS request. Only WORD alignment includes phonetic details (not CHARACTER).

### Phoneme/Viseme Response Structure (TTS 1.5 models only)

```json
{
  "result": {
    "audioContent": "<base64-encoded-audio>",
    "timestampInfo": {
      "wordAlignment": {
        "words": ["Hello", "world"],
        "wordStartTimeSeconds": [0.03, 0.5],
        "wordEndTimeSeconds": [0.46, 1.2],
        "phoneticDetails": [
          {
            "wordIndex": 0,
            "phones": [
              {
                "phoneSymbol": "h",
                "startTimeSeconds": 0.03,
                "durationSeconds": 0.18,
                "visemeSymbol": "aei"
              },
              {
                "phoneSymbol": "EH",
                "startTimeSeconds": 0.21,
                "durationSeconds": 0.10,
                "visemeSymbol": "aei"
              }
            ],
            "isPartial": false
          }
        ]
      }
    }
  }
}
```

### Viseme Categories (9 categories mapping phonemes to mouth shapes)

| Viseme Symbol    | Description              |
|------------------|--------------------------|
| `aei`            | Open mouth vowels        |
| `o`              | Rounded vowels           |
| `ee`             | Front vowels             |
| `bmp`            | Bilabial consonants      |
| `fv`             | Labiodental consonants   |
| `l`              | Lateral consonant        |
| `r`              | Rhotic sounds            |
| `th`             | Dental fricatives        |
| `qw`             | Rounded consonants       |
| `cdgknstxyz`     | Alveolar/velar consonants|

### Phone Entry Fields
- `phoneSymbol` - IPA notation
- `startTimeSeconds` - phoneme onset time
- `durationSeconds` - length in seconds
- `visemeSymbol` - one of the 9 categories above

### Timestamp Transport Strategies
- `SYNC` (default): Audio and timestamps arrive together in each chunk. Slightly higher latency.
- `ASYNC`: Audio arrives first, timestamps follow in separate trailing messages. Lower time-to-first-audio.

### Language Support
- English and Spanish supported
- Other languages experimental

### Important Notes
- `isPartial: true` means the word may be unstable (e.g., last word in a non-final streaming chunk)
- Enabling timestamps increases latency
- Phoneme/viseme details only available with TTS 1.5 models (not TTS 1)
- Phoneme details only returned for WORD alignment, not CHARACTER alignment

---

## 3. Real-Time Conversation Architecture

### Option A: Realtime WebSocket API (Speech-to-Speech)

Full-duplex voice conversation via WebSocket. Follows OpenAI Realtime protocol.

**Client-to-Server Events:**
| Event | Purpose |
|-------|---------|
| `session.update` | Configure model, instructions, audio, tools |
| `input_audio_buffer.append` | Stream base64 PCM16 audio chunks |
| `input_audio_buffer.commit` | Finalize audio as user message |
| `input_audio_buffer.clear` | Discard buffered audio |
| `conversation.item.create` | Send text message |
| `response.create` | Trigger model response |
| `response.cancel` | Stop in-progress response |
| `output_audio_buffer.clear` | Stop audio playback |
| `conversation.item.truncate` | Trim assistant audio |
| `conversation.item.delete` | Remove conversation items |

**Server-to-Client Events:**
| Event | Purpose |
|-------|---------|
| `session.created` | Connection ready |
| `session.updated` | Config confirmed |
| `conversation.item.added` | New conversation content |
| `input_audio_buffer.speech_started` | VAD detected user speaking |
| `input_audio_buffer.speech_stopped` | VAD detected user stopped |
| `response.created` | Response generation started |
| `response.output_item.added` | New output item |
| `response.output_audio.delta` | Audio chunk (base64 PCM16) |
| `response.output_audio_transcript.delta` | Transcript chunk |
| `response.done` | Response complete |
| `error` | Error with type, code, message |

**Audio Format:**
- PCM16, 24 kHz, mono, base64-encoded
- Recommended chunk size: 100-200ms
- Supported MIME types: audio/pcm, audio/pcmu, audio/pcma

**VAD (Voice Activity Detection):**
- Server-side VAD: configurable threshold (0-1), silence duration, prefix padding
- Semantic VAD: eagerness levels (low/medium/high/auto)

**Session Configuration:**
```json
{
  "type": "session.update",
  "session": {
    "type": "realtime",
    "model": "openai/gpt-4o-mini",
    "instructions": "You are a friendly assistant.",
    "output_modalities": ["audio", "text"],
    "temperature": 0.7,
    "max_output_tokens": 4096,
    "tools": [{ "function definitions" }],
    "tool_choice": "auto"
  }
}
```

**Sending user audio (from browser microphone):**
```javascript
// Capture at 24kHz mono, convert to PCM16
const pcm = new Int16Array(floatSamples.length);
for (let i = 0; i < floatSamples.length; i++)
  pcm[i] = Math.max(-32768, Math.min(32767, floatSamples[i] * 32768));

// Base64 encode and send
ws.send(JSON.stringify({
  type: 'input_audio_buffer.append',
  audio: btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)))
}));
```

**Sending text:**
```javascript
ws.send(JSON.stringify({
  type: 'conversation.item.create',
  item: {
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: 'Hello!' }]
  }
}));
ws.send(JSON.stringify({ type: 'response.create' }));
```

**IMPORTANT LIMITATION:** The Realtime API does NOT provide viseme/phoneme data alongside audio. You only get audio + text transcript.

### Option B: Hybrid Architecture (Realtime API + TTS API)

To get both real-time conversation AND viseme data, you would need to:
1. Use the Realtime API with `output_modalities: ["text"]` (text only)
2. Pipe the text response to the TTS WebSocket API with `timestampType: "WORD"`
3. Play the TTS audio and use the phoneme/viseme data for lip-sync

This adds latency but gives you viseme data.

### Option C: TTS WebSocket API for Viseme-Enriched Audio

**WebSocket URL:** `wss://api.inworld.ai/tts/v1/voice:streamBidirectional`

**Create a context:**
```json
{
  "create": {
    "voiceId": "Dennis",
    "modelId": "inworld-tts-1.5-max",
    "audioConfig": {
      "audioEncoding": "LINEAR16",
      "sampleRateHertz": 24000
    },
    "timestampType": "WORD",
    "timestampTransportStrategy": "ASYNC",
    "maxBufferDelayMs": 500,
    "bufferCharThreshold": 50,
    "autoMode": true
  }
}
```

**Stream text to it:**
```json
{
  "send_text": {
    "text": "Hello, how are you today?"
  },
  "contextId": "ctx-1"
}
```

**Receive audio chunks with viseme data:**
```json
{
  "result": {
    "contextId": "ctx-1",
    "audioChunk": {
      "audioContent": "<base64>",
      "timestampInfo": {
        "wordAlignment": {
          "words": ["Hello"],
          "wordStartTimeSeconds": [0.031],
          "wordEndTimeSeconds": [0.355],
          "phoneticDetails": [
            {
              "wordIndex": 0,
              "phones": [
                {
                  "phoneSymbol": "h",
                  "startTimeSeconds": 0.03,
                  "durationSeconds": 0.08,
                  "visemeSymbol": "aei"
                }
              ],
              "isPartial": false
            }
          ]
        }
      }
    }
  }
}
```

**Limits:** 20 concurrent WebSocket connections, 5 contexts per connection, 10min inactivity timeout.

---

## 4. Available SDKs for Web/JavaScript

### NPM Packages

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@inworld/web-core` | 2.10.0 | Browser SDK for character sessions, audio capture, text messages, triggers | Older SDK for legacy Simple API |
| `@inworld/nodejs-sdk` | 1.17.0 | Node.js SDK for character interaction | Older SDK for legacy Simple API |
| `@inworld/runtime` | 1.0.5 | Node.js SDK for LLM inference, graph orchestration, speech pipelines, retrieval, tool use, telemetry | Newer, more comprehensive |
| `@inworld/web-sdk` | 1.9.3 | Earlier web SDK | Deprecated (2+ years old) |
| `@inworld/graph-server` | 0.8.0 | Graph orchestration server | Newer |
| `@inworld/cli` | 0.3.1 | CLI tool | Utility |
| `@livekit/agents-plugin-inworld` | 1.2.2 | LiveKit integration plugin | Active, frequently updated |

### @inworld/web-core (v2.10.0) Dependencies
```
zod, uuid, defer-promise, snakecase-keys, base64-arraybuffer
```

### @inworld/runtime (v1.0.5) - Newer Runtime SDK
Full-featured Node.js SDK with dependencies including:
- protobufjs, @protobuf-ts/runtime (gRPC/protobuf communication)
- assemblyai (speech recognition)
- groq-sdk (LLM inference)
- node-record-lpcm16 (audio capture)

### GitHub Repositories (github.com/inworld-ai)
- `inworld-api-examples` - JavaScript API examples (MIT)
- `greeting-card-node` - Full-stack React + Node.js template (TypeScript)
- `voice-agent-node` - Voice agent template (TypeScript)
- `voice-agent-avatar-node` - Real-time avatar agent (TypeScript)
- `living-memories-node` - Talking-photo experiences (JavaScript)
- `llm-to-tts-node` - LLM to TTS pipeline (TypeScript)
- `inworld-nodejs-jwt-sample-app` - JWT authentication sample
- `tts` - InWorld TTS (Python, 690 stars)

### For Browser Integration

The most practical approaches are:
1. **Direct WebSocket** to the Realtime API (via a Node.js proxy for auth)
2. **Direct WebSocket** to the TTS API (for viseme data)
3. **@inworld/web-core** for the legacy character SDK
4. **LiveKit integration** via `@livekit/agents-plugin-inworld`

---

## 5. Authentication & Setup Requirements

### API Keys

**Where to get them:**
- Log into [Inworld Portal](https://platform.inworld.ai/api-keys)
- Click API Keys > Generate new key
- Copy the Base64 signature

**Key types:**
- **Integration API Keys**: Per-workspace, multiple allowed. Used for runtime (Realtime API, TTS API).
- **Studio API Keys**: Per-account, only one. Used for Studio/management API.

**Important:** API keys are workspace-specific. A key from workspace-1 won't work for workspace-2.

### Authentication Methods

**1. Basic Auth (server-side only):**
```
Authorization: Basic <base64-api-key>
```
WARNING: Never expose in client-side code.

**2. JWT Auth (recommended for browser):**

Your backend generates JWT tokens. The flow:

```
POST https://api.inworld.ai/auth/v1/tokens/token:generate
```

**Request headers:**
```
Authorization: IW1-HMAC-SHA256 ApiKey=<key>,DateTime=<YYYYMMDDHHMMSS>,Nonce=<nonce>,Signature=<sig>
Content-Type: application/json
```

**Request body:**
```json
{
  "key": "your_api_key",
  "resources": ["workspaces/your-workspace-id"]
}
```

**Signature generation (HMAC-SHA256):**
```typescript
function getSignatureKey(key: string, params: string[]) {
  let signature = `IW1${key}`;
  for (const param of params) {
    signature = HmacSHA256(param, signature).toString(enc.Hex);
  }
  return HmacSHA256('iw1_request', signature).toString(enc.Hex);
}

// params in order: DateTime, Host, Method, Nonce
// Method = 'ai.inworld.engine.WorldEngine/GenerateToken'
```

**JWT Response:**
```json
{
  "token": "...",
  "type": "Bearer",
  "expirationTime": "2025-05-16T02:50:26Z",
  "sessionId": "default:uuid"
}
```

**Use in browser:**
```
Authorization: Bearer <token>
```

### Resource Naming Convention

- **Characters:** `workspaces/{WORKSPACE_NAME}/characters/{CHARACTER_NAME}`
- **Scenes:** `workspaces/{WORKSPACE_NAME}/scenes/{SCENE_NAME}`

### Environment Variables (.env)
```
INWORLD_KEY=your_api_key
INWORLD_SECRET=your_api_secret
INWORLD_HOST=api.inworld.ai
INWORLD_WORKSPACE=workspaces/your-workspace-id
```

### Session Management
- Sessions expire after 30 minutes of inactivity
- TTS WebSocket contexts auto-close after 10 minutes inactivity
- You can resume sessions using `setSessionContinuation` with `previousDialog` or `previousState`

---

## 6. Recommended Architecture for Browser + Viseme

For a web app that needs real-time conversation WITH viseme/lip-sync data:

```
Browser                    Your Server                  InWorld APIs
  |                            |                            |
  |-- mic audio (WebRTC) ----->|                            |
  |                            |-- audio (WebSocket) ------>| Realtime API
  |                            |<-- text response ----------| (speech-to-speech)
  |                            |                            |
  |                            |-- text (WebSocket) ------->| TTS WebSocket API
  |                            |<-- audio + visemes --------| (with timestamps)
  |                            |                            |
  |<-- audio + viseme data ----|                            |
  |   (play audio, animate)    |                            |
```

OR simpler (text-only conversation):

```
Browser                    Your Server                  InWorld APIs
  |                            |                            |
  |-- text ------------------>|                             |
  |                            |-- LLM request ----------->| Any LLM API
  |                            |<-- text response ----------|
  |                            |                            |
  |                            |-- text (WebSocket) ------->| TTS WebSocket API
  |                            |<-- audio + visemes --------| (with timestamps)
  |                            |                            |
  |<-- audio + viseme data ----|                            |
```

---

## Key Takeaways

1. **Viseme data comes from the TTS API, not the Realtime API.** The Realtime API only outputs audio + text.
2. **TTS 1.5 models required** for phoneme/viseme data (TTS 1 only gives word timing).
3. **9 viseme categories** (aei, o, ee, bmp, fv, l, r, th, qw, cdgknstxyz) - relatively coarse granularity.
4. **WebSocket is the primary protocol** for both real-time conversation and TTS streaming.
5. **JWT auth required for browser** - never expose API keys client-side.
6. **The Realtime API follows OpenAI's protocol** - if you've used OpenAI Realtime, the schema is familiar.
7. **@inworld/web-core** is the browser SDK but targets their older Simple API system.
8. **@inworld/runtime** is their newer Node.js SDK with broader capabilities.
