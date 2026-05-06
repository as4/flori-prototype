import {useEffect, useState} from 'react';
import _ from 'lodash';

////////////////////////////////////////////////////////////////////////////////

const DEFAULT_BANDS = 6;
// fftSize=256 → 128 frequency bins; smoothing 0.75 dampens strobing without
// noticeable lag. Bin 1..64 covers ~80 Hz–5 kHz at a 44.1 kHz sample rate,
// which is the speech-relevant slice of the spectrum.
const DEFAULT_FFT_SIZE = 256;
const DEFAULT_SMOOTHING = 0.75;
const DEFAULT_MIN_BIN = 1;
const DEFAULT_MAX_BIN = 64;
const BYTE_MAX = 255;

type Options = {
  fftSize?: number;
  smoothing?: number;
  minBin?: number;
  maxBin?: number;
};

////////////////////////////////////////////////////////////////////////////////

let sharedAudioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (sharedAudioContext) return sharedAudioContext;

  const Ctor = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
};

// Call from inside a user gesture (pointerdown / keydown) so the shared
// AudioContext exists in 'running' state by the time useMicLevels' effect
// runs. Without this, the lazy creation happens after the gesture window has
// closed and the analyser sits suspended — getByteFrequencyData returns zeros
// and the bars never move.
export const unlockAudioContext = () => {
  const audioContext = getAudioContext();
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => { /* unsupported state — fall through */ });
  }
};

////////////////////////////////////////////////////////////////////////////////

// Reads byte frequency data from a MediaStream and emits `bands` normalized
// (0..1) bar levels each animation frame. While `stream` is null, returns a
// stable zero-filled array so callers can render an idle state.
const useMicLevels = (
  stream: MediaStream | null,
  bands = DEFAULT_BANDS,
  {
    fftSize = DEFAULT_FFT_SIZE,
    smoothing = DEFAULT_SMOOTHING,
    minBin = DEFAULT_MIN_BIN,
    maxBin = DEFAULT_MAX_BIN,
  }: Options = {}
) => {
  const [levels, setLevels] = useState<number[]>(() => _.times(bands, () => 0));

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  useEffect(
    () => {
      if (!stream) {
        setLevels(_.times(bands, () => 0));
        return;
      }

      const audioContext = getAudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothing;
      source.connect(analyser);

      const bins = new Uint8Array(analyser.frequencyBinCount);
      const usableMax = Math.min(maxBin, bins.length - 1);
      const binsPerBand = (usableMax - minBin) / bands;

      let rafId = 0;
      let cancelled = false;

      const tick = () => {
        analyser.getByteFrequencyData(bins);

        const next = _.times(
          bands,
          band => {
            const lo = Math.floor(minBin + band * binsPerBand);
            const hi = Math.max(lo + 1, Math.floor(minBin + (band + 1) * binsPerBand));
            let sum = 0;
            for (let bin = lo; bin < hi; bin++) sum += bins[bin];
            return sum / (hi - lo) / BYTE_MAX;
          }
        );

        setLevels(next);
        rafId = requestAnimationFrame(tick);
      };

      // Resume before starting the loop. The unlock should already have
      // happened in the user-gesture handler that produced this stream, but
      // awaiting here makes the suspended-state edge case explicit.
      const startLoop = async () => {
        if (audioContext.state === 'suspended') {
          try { await audioContext.resume(); } catch { /* fall through */ }
        }
        if (cancelled) return;
        rafId = requestAnimationFrame(tick);
      };
      startLoop();

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        source.disconnect();
        setLevels(_.times(bands, () => 0));
      };
    },
    [stream, bands, fftSize, smoothing, minBin, maxBin]
  );

  return levels;
};

export default useMicLevels;
