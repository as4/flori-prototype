import {useState, useRef, useEffect} from 'react';

////////////////////////////////////////////////////////////////////////////////

type TextDebugInputProps = {
  isConnected: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  onSend: (text: string) => void;
};

////////////////////////////////////////////////////////////////////////////////

const TextDebugInput = ({isConnected, isProcessing, isSpeaking, onSend}: TextDebugInputProps) => {
  // State
  const [text, setText] = useState("Hi, I'm Flori — your warm companion for women's health, here to listen, reflect, and help you tune in to whatever your body or mind is telling you today.");
  const [ttfaMs, setTtfaMs] = useState<number | null>(null);

  // Stamped on Send press, cleared once we've measured the first audio
  // transition; survives the processing → speaking gap without re-renders.
  const sendTimeRef = useRef<number | null>(null);

  //--------------------------------------------------------------------------
  //
  //  Event handlers
  //
  //--------------------------------------------------------------------------

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && isConnected) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendTimeRef.current = Date.now();
    setTtfaMs(null);
    onSend(trimmed);
  };

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  useEffect(
    () => {
      if (!isSpeaking || sendTimeRef.current === null) return;
      setTtfaMs(Date.now() - sendTimeRef.current);
      sendTimeRef.current = null;
    },
    [isSpeaking]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <details className="text-fallback">
      <summary>Text input (debugging)</summary>
      <div className="form-group">
        <textarea
          id="text"
          value={text}
          placeholder="Type something..."
          rows={3}
          disabled={!isConnected}
          onKeyDown={handleKeyDown}
          onChange={event => setText(event.target.value)}
        />
      </div>
      <div className="form-row text-debug-actions">
        <button
          className="btn btn-primary"
          type="button"
          disabled={!isConnected || !text.trim() || isProcessing}
          onClick={handleSend}
        >
          {isProcessing ? 'Processing...' : 'Send'}
        </button>
        <span className="ttfa-pill" title="Time-to-first-audio from Send press">
          {ttfaMs !== null ? `TTFA ${ttfaMs}ms` : 'TTFA —'}
        </span>
      </div>
    </details>
  );
};

export default TextDebugInput;
