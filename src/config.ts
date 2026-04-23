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
