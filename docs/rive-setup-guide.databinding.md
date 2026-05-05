# Rive Character Setup Guide (data binding — DRAFT)

> **Status: temp / draft.** This is the data-binding version of `rive-setup-guide.md`. Once we've validated the artist's data-binding `.riv` and the runtime side is migrated, this file replaces the original.

This guide describes how to deliver a Rive character that the Flori app can drive at runtime. It uses **Rive data binding** — the artist exposes a typed `ViewModel` from the editor and the app reads/writes its properties. State machines still exist internally for blending and transitions, but they are an implementation detail; the **ViewModel is the contract** between artist and code.

The conventions below mirror the partner company's Rive structure (their `commitment.riv` reference file) so our work plugs cleanly into their pipeline:

- ViewModel named `data` (lowercase, generic — not tied to the artboard name).
- Default instance named `Instance`.
- Snake_case property names (`viseme_id`, `emotion_id`).
- **Numbers, not enums**, for state IDs. The artist wires transitions like "when `viseme_id == 1` → AEI pose."
- Defaults filled in by the artist on the default instance.

> **Editor + runtime version**
> Data binding requires a recent Rive editor build and a runtime that supports it (`@rive-app/canvas` is pinned in this repo's `package.json`). When you re-export, please tell us the editor version you used so we can verify compatibility.

## What you need to create

A `.riv` file containing:

1. One artboard with the character.
2. A **ViewModel** named `data` (see Step 2 below) with three properties: `viseme_id`, `emotion_id`, `wave`.
3. A **default instance** named `Instance` with sensible starting values (`viseme_id = 0`, `emotion_id = 0`).
4. State machine(s) internally bound to those properties (for blending between poses) — but the app does not read state machine inputs directly anymore.

## Step 1: Create mouth shapes

Same as before — **11 mouth poses**, each representing a group of sounds. The numeric ID in the first column is what the app writes to `viseme_id`:

| `viseme_id` | Name | What the mouth looks like | Sounds |
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

These IDs are part of the runtime contract — once shipped, please don't renumber without flagging it.

## Step 2: Define the ViewModel

In the Rive editor, create a ViewModel called **`data`** with these properties:

| Property | Type | Range | Default | Driven by |
|----------|------|-------|---------|-----------|
| `viseme_id` | Number | `0`–`10` (see Step 1) | `0` (Silent) | App writes during speech (~25 changes/sec) |
| `emotion_id` | Number | `0`–`4` (see Step 4) | `0` (Listening) | App writes once per reply |
| `wave` | Trigger | — | — | App fires for one-shot wave gesture |

> **Note on `wave`:** the partner's reference file doesn't use Trigger properties (they encode everything as numbers). For Flori we want a Trigger here because wave is genuinely a one-shot event — using a number counter would be hacky. This is the only departure from the partner's convention; everything else in this guide matches their structure.

Then bind those properties inside the editor:

- `viseme_id` drives a state machine that transitions between the 11 mouth poses (one transition per ID).
- `emotion_id` drives a separate state machine layer that transitions between the 5 emotion poses.
- `wave` is a trigger that plays the wave one-shot and returns to the current emotion.

Create a default instance named **`Instance`** on the artboard with the starting values shown in the table.

## Step 3: Test it

1. Open the app in your browser.
2. Click "Load .riv file" and pick your file.
3. The app will look for the `data` ViewModel and bind its `Instance` automatically.
4. Enter an API key, type some text, and hit Send.
5. Watch the mouth move in sync with speech and the emotion change between replies.

## Tips (lip-sync)

- **Blend States** still work great — use a 1D Blend State driven by `viseme_id` to smoothly interpolate between mouth shapes instead of snapping.
- IDs `0` (Silent) and `10` (Rest) look similar but aren't the same — Rest has the mouth very slightly open since the character is mid-speech.
- Transitions happen fast (some sounds are only 40–80ms), so keep mouth animations simple and snappy.
- Idle animations (blinking, breathing) on separate layers won't interfere with the mouth.

## Step 4: Emotion animations

We want Flori to emote while talking — look present, empathetic, happy, curious, surprised. The lip-sync from Steps 1–3 is unchanged; emotions are added on **top** of it via `emotion_id`.

### Emotion IDs

| `emotion_id` | Name | Intent | How Flori should look |
|---|------|--------|-----------------------|
| 0 | Listening | Fully present, attentive — this is her **default resting state**. Most of the time Flori is just listening. | Soft, relaxed posture. Slight forward lean if possible. Gentle eyes, mouth neutral or barely smiling. Only eyes moving; a subtle breathing idle is welcome. |
| 1 | Empathetic / Supportive | "I'm with you." Used when the user shares something painful — this is a **super important** state because users will often open up about how bad they feel. | Soft, warm eyes. Gentle expression — **not sad**. Slow, comforting movement. An "open arms" pose with a different face expression could work here. |
| 2 | Happy | Positive reinforcement. Warm and calm — not excited. | Gentle smile. Light, subtle movement. Feels grounded, not hyper. |
| 3 | Curious / Thinking | Reflective — Flori is about to ask a follow-up, processing what was said. | A thinking pose. Slightly engaged and playful — "hmm, tell me more" / "okay, and what do you think about that?" |
| 4 | Light Surprise | A small, human-like "oh!" reaction — a friend who is genuinely invested. | Slightly widened eyes. Small, quick reaction. Keep it subtle — **no dramatic shock**. |

(Emotion list is still being refined — this is a working set, not final.)

### Layering

Put the emotion animations on **a separate layer** from the mouth. This is important — if the emotion layer animates the mouth too, it will fight the lip-sync and the mouth will twitch.

- **Layer 1 (mouth)** — driven by `viseme_id`. Changes rapidly during speech.
- **Layer 2 (face / body)** — driven by `emotion_id`. Changes rarely (once per reply, or less).

### Tips for emotions

- **Blend the transition smoothly** — emotion changes should take ~300–500ms, not snap. A Blend State between emotion poses looks natural.
- **`emotion_id = 0` (Listening) is the safe default** — the app will set this when Flori isn't actively reacting, when the page first loads, and between replies. It should feel calm and complete on its own; everything else is a brief departure from this baseline.
- **Empathetic (`emotion_id = 1`) is the most used emotional state** — users will frequently share painful things (cycle pain, fertility struggles, bad news). This one needs to land. Soft and quiet beats fully-formed sadness.
- **Don't animate the mouth in emotion layers** — any mouth shape here will override the lip-sync. If Happy needs a smile, handle it via eyes, cheeks, body, or a very subtle non-lip-sync mouth element.
- The character should still lip-sync correctly while any emotion is active. If lip-sync breaks when emotions change, the mouth is probably being touched in two layers at once — move mouth keyframes off the emotion layer.

## Step 5: One-shot gestures

Some animations aren't emotional states — they fire once and return to the current emotion. **Wave** is the first of these, used in onboarding and re-engagement moments.

In the `data` ViewModel, `wave` is a **Trigger** property. Inside the editor, hook it up so that firing it plays the wave animation and then automatically returns control to whatever `emotion_id` is currently set.

More one-shots may be added later. When you're about to build a new one, let us know — we'll agree on the property name together and add it to the ViewModel as another Trigger.

## Versioning the contract

Treat the `data` ViewModel like an API:

- **Adding a property** is safe — old app versions just won't write to it.
- **Adding a new ID** at the **end** of the existing range (e.g. `emotion_id = 5`) is safe, as long as old IDs keep their meaning.
- **Renumbering existing IDs**, **renaming properties**, or **removing properties** is a breaking change. Flag it before exporting so we can land the code change at the same time.

## Delivery

Overwrite the same `.riv` file you gave us before. Same path, same filename. The app will pick it up automatically on the next reload — no code change needed as long as:

- The ViewModel is named exactly **`data`**.
- Its properties are named exactly **`viseme_id`** (Number), **`emotion_id`** (Number), **`wave`** (Trigger).
- Numeric IDs match the tables in Step 1 and Step 4.
- A default instance named **`Instance`** is set on the artboard, with `viseme_id = 0` and `emotion_id = 0`.

If any of those names need to change, please tell us first so we update the runtime side in the same release.
