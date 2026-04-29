import {useState} from 'react';

////////////////////////////////////////////////////////////////////////////////

type TextDebugInputProps = {
  isConnected: boolean;
  isProcessing: boolean;
  onSend: (text: string) => void;
};

////////////////////////////////////////////////////////////////////////////////

const TextDebugInput = ({isConnected, isProcessing, onSend}: TextDebugInputProps) => {
  // State
  const [text, setText] = useState("Hi, I'm Flori — your warm companion for women's health, here to listen, reflect, and help you tune in to whatever your body or mind is telling you today.");

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
    onSend(trimmed);
  };

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
      <button
        className="btn btn-primary"
        type="button"
        disabled={!isConnected || !text.trim() || isProcessing}
        onClick={handleSend}
      >
        {isProcessing ? 'Processing...' : 'Send'}
      </button>
    </details>
  );
};

export default TextDebugInput;
