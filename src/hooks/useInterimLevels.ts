import {useEffect, useRef, useState} from 'react';
import _ from 'lodash';

////////////////////////////////////////////////////////////////////////////////

const DEFAULT_BANDS = 6;
const DEFAULT_DECAY_MS = 350;
const DEFAULT_BASELINE = 0.08;

const LEVEL_MAX = 1;
const LEVEL_MIN = 0;

// Each band gets its own peak target on token arrival (so bars don't all
// snap to the same height) and its own decay-rate multiplier (so they don't
// all fall together). Targets are sampled uniformly in [PEAK_MIN..PEAK_MAX];
// decay factors are sampled once per band and stay fixed so each band has a
// stable "personality".
const PEAK_MIN = 0.4;
const PEAK_MAX = 1;
const DECAY_FACTOR_MIN = 0.7;
const DECAY_FACTOR_MAX = 1.3;

type Options = {
  decayMs?: number;
  baseline?: number;
};

////////////////////////////////////////////////////////////////////////////////

const sampleDecayFactors = (bands: number) =>
  _.times(bands, () => DECAY_FACTOR_MIN + Math.random() * (DECAY_FACTOR_MAX - DECAY_FACTOR_MIN));

////////////////////////////////////////////////////////////////////////////////

// Safari fallback for useMicLevels: webkitSpeechRecognition owns the mic
// exclusively, so we can't FFT the stream. Instead each interim-transcript
// change kicks a per-band "energy" to a randomized peak; energies decay
// independently at per-band rates back to a low baseline. Returns an array of
// length `bands`, values 0..1 — same shape as useMicLevels.
const useInterimLevels = (
  active: boolean,
  interim: string,
  bands = DEFAULT_BANDS,
  {decayMs = DEFAULT_DECAY_MS, baseline = DEFAULT_BASELINE}: Options = {}
) => {
  const [levels, setLevels] = useState<number[]>(() => _.times(bands, () => LEVEL_MIN));

  const energiesRef = useRef<number[]>(_.times(bands, () => LEVEL_MIN));
  const decayFactorsRef = useRef<number[]>(sampleDecayFactors(bands));
  const previousInterimRef = useRef('');

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  // Pulse on interim change — token arrived → kick each band to its own peak.
  useEffect(
    () => {
      if (!active) return;
      if (interim === previousInterimRef.current) return;

      previousInterimRef.current = interim;
      const energies = energiesRef.current;
      for (let band = 0; band < bands; band++) {
        energies[band] = PEAK_MIN + Math.random() * (PEAK_MAX - PEAK_MIN);
      }
    },
    [active, interim, bands]
  );

  // RAF loop: decay each band's energy at its own rate, emit levels.
  useEffect(
    () => {
      if (!active) {
        energiesRef.current = _.times(bands, () => LEVEL_MIN);
        previousInterimRef.current = '';
        setLevels(_.times(bands, () => LEVEL_MIN));
        return;
      }

      // Re-sample decay factors when band count changes so the array stays
      // in sync; otherwise keep the existing factors stable across renders.
      if (decayFactorsRef.current.length !== bands) {
        decayFactorsRef.current = sampleDecayFactors(bands);
      }

      let rafId = 0;
      let lastTimestamp = performance.now();

      const tick = (now: number) => {
        const dt = now - lastTimestamp;
        lastTimestamp = now;

        const energies = energiesRef.current;
        const decayFactors = decayFactorsRef.current;
        const decayPerMs = dt / decayMs;

        for (let band = 0; band < bands; band++) {
          const next = energies[band] - decayPerMs * decayFactors[band];
          energies[band] = Math.max(baseline, next);
        }

        setLevels(_.map(energies, energy => Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, energy))));
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      return () => cancelAnimationFrame(rafId);
    },
    [active, bands, decayMs, baseline]
  );

  return levels;
};

export default useInterimLevels;
