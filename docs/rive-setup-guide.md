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
