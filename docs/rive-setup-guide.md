# Rive Character Setup Guide

## What you need to create

A Rive file (.riv) with a character that has different mouth shapes for lip-syncing.

## Step 1: Create mouth shapes

You need **11 mouth poses** for your character. Each one represents a group of sounds:

| # | Name | What the mouth looks like | Sounds |
|---|------|---------------------------|--------|
| 0 | Silent | Mouth closed, neutral face | (no sound, pauses) |
| 1 | AEI | Mouth open wide | "ah", "eh", "uh" — as in **a**pple, **e**gg |
| 2 | O | Lips rounded, open | "oh", "oo" — as in **o**pen, b**oo**k |
| 3 | EE | Wide smile, teeth showing | "ee", "ih" — as in **ee**l, h**i**ll |
| 4 | BMP | Lips pressed together | "b", "m", "p" — as in **b**all, **m**om, **p**op |
| 5 | FV | Bottom lip touches upper teeth | "f", "v" — as in **f**ish, **v**an |
| 6 | L | Tongue tip touches roof of mouth | "l" — as in **l**emon |
| 7 | R | Tongue pulled back, lips slightly open | "r" — as in **r**ed |
| 8 | TH | Tongue peeks between teeth | "th" — as in **th**ink, **th**at |
| 9 | QW | Lips pursed into a small circle | "w", "qu" — as in **w**ater, **qu**een |
| 10 | Rest | Mouth barely open, neutral | "d", "g", "k", "n", "s", "t" — as in **d**og, **s**un |

## Step 2: Set up the State Machine

1. Create a new **State Machine** (any name works — the app will detect it automatically)
2. Add a **Number input** and name it exactly: `visemeId`
   - If you prefer a different name, that's fine — there's a text field in the app to change it
3. Create transitions between your mouth poses based on the `visemeId` value:
   - When `visemeId` = 0 → go to Silent pose
   - When `visemeId` = 1 → go to AEI pose
   - When `visemeId` = 2 → go to O pose
   - ...and so on for all 11

## Step 3: Test it

1. Open the app in your browser
2. Click "Load .riv file" and pick your file
3. The state machine and input should be detected automatically
4. Enter an API key, type some text, and hit Send
5. Watch your character's mouth move in sync with the speech!

## Tips

- **Blend States** work great here — instead of snapping between poses, you can use a 1D Blend State in Rive to smoothly interpolate between mouth shapes
- Poses 0 and 10 (Silent and Rest) look similar but aren't the same — Rest has the mouth very slightly open since the character is mid-speech
- The transitions happen fast (some sounds are only 40-80ms), so keep your animations simple and snappy
- You can add idle animations (blinking, breathing) on separate layers — they won't interfere with the mouth

## Step 4 (optional): Emotion animations

We want Flori to emote while talking — look present, empathetic, happy, curious, surprised. The lip-sync from Steps 1–3 is unchanged; emotions are added on **top** of it.

### How it's set up

1. In the **same state machine** you already have, add a second input:
   - Type: **Number**
   - Name (exactly): `emotionId`
2. Each emotion gets its own ID. Use this mapping so it matches what the app sends:

| ID | Name | Intent | How Flori should look |
|----|------|--------|-----------------------|
| 0 | Listening | Fully present, attentive — this is her **default resting state**. Most of the time Flori is just listening. | Soft, relaxed posture. Slight forward lean if possible. Gentle eyes, mouth neutral or barely smiling. Only eyes moving; a subtle breathing idle is welcome. |
| 1 | Empathetic / Supportive | "I'm with you." Used when the user shares something painful — this is a **super important** state because users will often open up about how bad they feel. | Soft, warm eyes. Gentle expression — **not sad**. Slow, comforting movement. An "open arms" pose with a different face expression could work here. |
| 2 | Happy | Positive reinforcement. Warm and calm — not excited. | Gentle smile. Light, subtle movement. Feels grounded, not hyper. |
| 3 | Curious / Thinking | Reflective — Flori is about to ask a follow-up, processing what was said. | A thinking pose (the one you already have, if you like). Slightly engaged and playful — "hmm, tell me more" / "okay, and what do you think about that?" |
| 4 | Light Surprise | A small, human-like "oh!" reaction — a friend who is genuinely invested. | Slightly widened eyes. Small, quick reaction. Keep it subtle — **no dramatic shock**. |

(Emotion list is still being refined — this is a working set, not final.)

3. Put the emotion animations on **a separate layer** from the mouth. This is important — if the emotion layer animates the mouth too, it will fight the lip-sync and the mouth will twitch. Think of it like:
   - **Layer 1 (mouth)** — driven by `visemeId`. Changes rapidly (many times per second during speech).
   - **Layer 2 (face / body)** — driven by `emotionId`. Changes rarely (once per reply, or less).

### Tips for emotions

- **Blend the transition smoothly** — emotion changes should take ~300-500ms, not snap. A Blend State between emotion poses looks natural.
- **Listening (ID 0) is the safe default** — the app will set this when Flori isn't actively reacting, when the page first loads, and between replies. It should feel calm and complete on its own; everything else is a brief departure from this baseline.
- **Empathetic is the most used emotional state** — users will frequently share painful things (cycle pain, fertility struggles, bad news). This one needs to land. Soft and quiet beats fully-formed sadness.
- **Don't animate the mouth in emotion layers** — any mouth shape here will override the lip-sync. If happy needs a smile, handle it via eyes, cheeks, body, or a very subtle non-lip-sync mouth element.
- The character should still lip-sync correctly while any emotion is active. If lip-sync breaks when emotions change, the mouth is probably being touched in two layers at once — move mouth keyframes off the emotion layer.

### Step 5 (optional): One-shot gestures

Some animations aren't emotional states — they fire once and return to the current emotion. **Wave** is the first of these, used in onboarding and re-engagement moments.

For each one-shot gesture, add a **Trigger** input to the same state machine. For Wave, name it exactly `waveGesture`. When the app fires the trigger, Flori should play the wave animation and then automatically return to whichever emotion is currently set on `emotionId`.

More one-shots may be added later — let us know when you're about to build something new and we'll agree on the trigger name together.

### Delivery

Overwrite the same `.riv` file you gave us before. Same path, same filename. The app will pick it up automatically on the next reload — no code change needed as long as the inputs are named exactly `emotionId` (Number) and `waveGesture` (Trigger).
