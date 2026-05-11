////////////////////////////////////////////////////////////////////////////////

// Default Rive character bundled with the app. Artist drops future iterations
// at this same path so the code never has to change.
export const DEFAULT_RIV_URL = '/riv/flori.riv';

////////////////////////////////////////////////////////////////////////////////

export const TTS_MODELS = [
  {id: 'inworld-tts-1.5-mini', label: 'Mini'},
  {id: 'inworld-tts-1.5-max', label: 'Max'},
] as const;

export const DEFAULT_TTS_MODEL = TTS_MODELS[0].id;

////////////////////////////////////////////////////////////////////////////////

// All one-shot triggers exposed by the current .riv's `data` ViewModel.
// Subsets of this list (e.g. IDLE_GESTURE_TRIGGERS) decide which fire
// automatically; the rest are reserved for future hand-driven moments.
export const RIVE_TRIGGERS = ['wave', 'excited_1', 'excited_2', 'excited_3', 'write', 'shock', 'annoyed'] as const;
export type RiveTriggerName = typeof RIVE_TRIGGERS[number];

// Subset of RIVE_TRIGGERS that fires randomly during idle. Two consecutive
// "excited_*" picks look repetitive, so the picker forces a non-excited pick
// after any excited_*.
export const IDLE_GESTURE_TRIGGERS: RiveTriggerName[] = ['wave', 'excited_3'];

// First idle gesture of the session — shorter delay so Flori feels alive
// shortly after page load instead of standing still for 5–14s.
export const IDLE_GESTURE_FIRST_DELAY_MIN_MS = 1500;
export const IDLE_GESTURE_FIRST_DELAY_MAX_MS = 3000;

// Random delay between subsequent idle gestures.
export const IDLE_GESTURE_DELAY_MIN_MS = 5000;
export const IDLE_GESTURE_DELAY_MAX_MS = 14000;

////////////////////////////////////////////////////////////////////////////////

// iOS Safari mutes Web Audio when the hardware silent switch is on. Setting
// the audio session to "playback" + holding it open with a silent looping
// source bypasses this — at the cost of warming the device and surfacing a
// lock-screen Now Playing card. For pitches, prefer asking presenters to
// unmute their phone over keeping the override on.
export const OVERRIDE_IOS_SILENT_SWITCH = false;
