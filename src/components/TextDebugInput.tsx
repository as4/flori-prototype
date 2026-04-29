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
  const [text, setText] = useState('Hello! This is a test of the InWorld TTS viseme system.');

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
