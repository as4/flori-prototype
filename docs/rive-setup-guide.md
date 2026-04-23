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

We want Flori to emote while talking — look happy, sad, surprised, etc. The lip-sync from Steps 1–3 is unchanged; emotions are added on **top** of it.

### How it's set up

1. In the **same state machine** you already have, add a second input:
   - Type: **Number**
   - Name (exactly): `emotionId`
2. Each emotion gets its own ID. Use this mapping so it matches what the app sends:

| ID | Name | How Flori should look |
|----|------|------------------------|
| 0 | Neutral | Default resting expression |
| 1 | Happy | Smiling eyes, cheerful body language |
| 2 | Sad | Droopy eyes, slumped posture |
| 3 | Surprised | Wide eyes, raised brows |
| 4 | Thinking | One side tilted, eyes looking up |

You can suggest more — just let us know the names and we'll match them up.

3. Put the emotion animations on **a separate layer** from the mouth. This is important — if the emotion layer animates the mouth too, it will fight the lip-sync and the mouth will twitch. Think of it like:
   - **Layer 1 (mouth)** — driven by `visemeId`. Changes rapidly (many times per second during speech).
   - **Layer 2 (face / body)** — driven by `emotionId`. Changes rarely (once per reply, or less).

### Tips for emotions

- **Blend the transition smoothly** — emotion changes should take ~300-500ms, not snap. A Blend State between emotion poses looks natural.
- **Neutral (ID 0) is the safe default** — the app will set this when Flori isn't actively emoting, and also when the page first loads before any reply comes in.
- **Don't animate the mouth in emotion layers** — any mouth shape here will override the lip-sync. If a happy expression needs a smile, handle it via eyes, cheeks, body, or a very subtle non-lip-sync mouth element.
- The character should still lip-sync correctly while any emotion is active. If lip-sync breaks when emotions change, the mouth is probably being touched in two layers at once — move mouth keyframes off the emotion layer.

### Delivery

Overwrite the same `.riv` file you gave us before. Same path, same filename. The app will pick it up automatically on the next reload — no code change needed as long as the input is named exactly `emotionId`.
