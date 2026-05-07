import {useState, useRef, useCallback, useEffect} from 'react';
import {log} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: {transcript: string};
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface UseSpeechRecognitionOptions {
  lang?: string;
  onFinal?: (transcript: string) => void;
  onError?: (message: string) => void;
}

////////////////////////////////////////////////////////////////////////////////

const SERVICE_PERMISSION_HINT =
  'Safari blocked speech recognition. Open System Settings > Privacy & Security > Speech Recognition and enable it for Safari, then reload the page.';

const getCtor = (): SpeechRecognitionCtor | null => {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
};

const isSafari = () => {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
};

////////////////////////////////////////////////////////////////////////////////

const useSpeechRecognition = ({lang = 'en-US', onFinal, onError}: UseSpeechRecognitionOptions = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [supported] = useState(() => getCtor() !== null);
  // Live mic stream while listening (Chrome only). Safari's
  // webkitSpeechRecognition owns the mic exclusively, so we leave this null
  // there. Consumers (e.g. useMicLevels) read this to drive visualization.
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  // Toggled true on start(), false on stop()/cancel(). start() checks this
  // after `acquireStream` to bail out if the consumer released during the
  // (potentially long) permission prompt — otherwise iOS would still spin
  // up recognition once the user finally responds, leaving the button stuck
  // in listening state without a real press behind it.
  const shouldListenRef = useRef(false);
  // Safari grants per-stream and re-prompts the next time getUserMedia
  // opens a fresh stream after the previous one was stopped. Caching the
  // first successful probe avoids the re-prompt on every tap.
  const safariProbeGrantedRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);

  onFinalRef.current = onFinal;
  onErrorRef.current = onError;

  const releaseStream = useCallback(
    () => {
      const current = streamRef.current;
      if (!current) return;

      for (const track of current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
      setStream(null);
    },
    []
  );

  // Always call getUserMedia first as a deterministic permission probe — its
  // rejection is the only reliable denial signal we have on iOS Safari (the
  // recognition.onerror path silently swallows the first denial of a
  // session). Chrome keeps the stream open for level visualization; on
  // Safari/iOS we close it immediately AND remember that the probe
  // succeeded so subsequent taps skip the probe (otherwise iOS re-prompts
  // each time a fresh stream opens after the previous was stopped, plus
  // each probe adds a visible 'initializing' flash).
  const acquireStream = async (): Promise<MediaStream | null | 'denied'> => {
    if (isSafari() && safariProbeGrantedRef.current) return null;

    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.('Microphone API not available (needs HTTPS or localhost)');
      return 'denied';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      if (isSafari()) {
        safariProbeGrantedRef.current = true;
        for (const track of stream.getTracks()) track.stop();
        return null;
      }
      return stream;
    } catch (error) {
      onErrorRef.current?.(`Microphone denied: ${(error as Error).message}`);
      return 'denied';
    }
  };

  const stop = useCallback(
    () => {
      shouldListenRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        try { recognition.stop(); } catch { /* already stopped */ }
      }
    },
    []
  );

  // Discard in-flight transcript and abort. Clearing the refs first means
  // onend's combined string is empty and the existing guard skips onFinal,
  // so the bad transcript never reaches the LLM.
  const cancel = useCallback(
    () => {
      shouldListenRef.current = false;
      finalRef.current = '';
      interimRef.current = '';
      const recognition = recognitionRef.current;
      if (recognition) {
        try { recognition.abort(); } catch { /* already gone */ }
      }
    },
    []
  );

  const start = useCallback(
    async () => {
      const Ctor = getCtor();
      if (!Ctor) {
        onErrorRef.current?.('Speech recognition not supported in this browser');
        return;
      }

      shouldListenRef.current = true;

      const acquired = await acquireStream();
      if (acquired === 'denied') return;

      // The consumer (PTT button) called stop()/cancel() during the await —
      // typically the iOS permission prompt blurred focus and the page
      // released the press. Tear down the freshly-acquired stream and bail
      // out before recognition.start() runs.
      if (!shouldListenRef.current) {
        if (acquired) {
          for (const track of acquired.getTracks()) track.stop();
        }
        return;
      }

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
        recognitionRef.current = null;
      }

      // A previous session's stream may still be open if the user re-presses
      // before onend fires. Close it before installing the new one.
      releaseStream();

      if (acquired) {
        streamRef.current = acquired;
        setStream(acquired);
      }

      const recognition = new Ctor();
      recognition.lang = lang;
      // Push-to-talk: keep listening until the user releases the button. With
      // continuous=false, Chrome auto-ends after a short pause and fires
      // onFinal before the user is done talking.
      recognition.continuous = true;
      recognition.interimResults = true;

      finalRef.current = '';
      interimRef.current = '';
      setTranscript('');
      setInterim('');

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = event => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            // Safari (and Chrome) continuous mode emits each post-pause
            // utterance as a fresh final without a leading space, producing
            // "andWell" / "WilbursEven" runs. Force a separator and
            // collapse extras.
            finalRef.current = `${finalRef.current} ${text}`.replace(/\s+/g, ' ').trimStart();
          } else {
            interimText += text;
          }
        }
        interimRef.current = interimText;
        setTranscript(finalRef.current);
        setInterim(interimText);
      };

      recognition.onerror = event => {
        // Diagnostic: log every event before suppression so we can see the
        // raw shape iOS Safari is firing for permission denial.
        log('Recognition onerror', {error: event.error, message: event.message});
        // "no-speech" and "aborted" are expected in push-to-talk flow
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        const raw = event.message || event.error;
        const isServicePermission = /service-not-allowed|service permission/i.test(raw);
        onErrorRef.current?.(isServicePermission ? `${raw}. ${SERVICE_PERMISSION_HINT}` : raw);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterim('');
        // Combine final + interim because the user releases the PTT button
        // mid-utterance — the tail (most recent words) is often still in
        // interim when stop() fires. Sending only finalRef would clip it.
        const combined = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, ' ').trim();
        if (combined) {
          onFinalRef.current?.(combined);
        }
        recognitionRef.current = null;
        releaseStream();
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        onErrorRef.current?.((error as Error).message);
      }
    },
    [lang, releaseStream]
  );

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
      releaseStream();
    },
    [releaseStream]
  );

  return {isListening, transcript, interim, supported, stream, start, stop, cancel};
};

export default useSpeechRecognition;
