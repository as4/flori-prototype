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

// iOS Safari mutes Web Audio when the hardware silent switch is on. Setting
// the audio session to "playback" + holding it open with a silent looping
// source bypasses this — at the cost of warming the device and surfacing a
// lock-screen Now Playing card. For pitches, prefer asking presenters to
// unmute their phone over keeping the override on.
export const OVERRIDE_IOS_SILENT_SWITCH = false;
