import {useState, useRef, useCallback, useEffect} from 'react';

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

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const micGrantedRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);

  onFinalRef.current = onFinal;
  onErrorRef.current = onError;

  // Chrome's webkitSpeechRecognition will not trigger a mic prompt on its own,
  // so we pre-request via getUserMedia and drop the stream. Safari manages its
  // own permission flow inside webkitSpeechRecognition.start() — pre-fetching
  // there conflicts with its internal permission check, so we skip it.
  const ensureMicPermission = async () => {
    if (micGrantedRef.current) return true;
    if (isSafari()) {
      micGrantedRef.current = true;
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.('Microphone API not available (needs HTTPS or localhost)');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      for (const track of stream.getTracks()) {
        track.stop();
      }
      micGrantedRef.current = true;
      return true;
    } catch (error) {
      onErrorRef.current?.(`Microphone denied: ${(error as Error).message}`);
      return false;
    }
  };

  const stop = useCallback(
    () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        try { recognition.stop(); } catch { /* already stopped */ }
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

      const granted = await ensureMicPermission();
      if (!granted) return;

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
        recognitionRef.current = null;
      }

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
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
            finalRef.current += text;
          } else {
            interimText += text;
          }
        }
        interimRef.current = interimText;
        setTranscript(finalRef.current);
        setInterim(interimText);
      };

      recognition.onerror = event => {
        // "no-speech" and "aborted" are expected in push-to-talk flow
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        const raw = event.message || event.error;
        const isServicePermission = /service-not-allowed|service permission/i.test(raw);
        onErrorRef.current?.(isServicePermission ? `${raw}. ${SERVICE_PERMISSION_HINT}` : raw);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterim('');
        // Safari often ends without emitting isFinal results when stop() is
        // called mid-utterance (push-to-talk). Fall back to the latest interim.
        const finalText = (finalRef.current || interimRef.current).trim();
        if (finalText) {
          onFinalRef.current?.(finalText);
        }
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        onErrorRef.current?.((error as Error).message);
      }
    },
    [lang]
  );

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
    },
    []
  );

  return {isListening, transcript, interim, supported, start, stop};
};

export default useSpeechRecognition;
