import { useState, useCallback } from 'react';
import useLocalStorage from './hooks/useLocalStorage';
import useInworldTTS from './hooks/useInworldTTS';
import RiveCharacter from './components/RiveCharacter';
import DebugConsole from './components/DebugConsole';
import './App.css';

const STATUS_LABELS = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  processing: 'Processing...',
  speaking: 'Speaking',
  error: 'Error',
};

const App = () => {
  const [apiKey, setApiKey] = useLocalStorage('flori-api-key');
  const [voiceId, setVoiceId] = useLocalStorage('flori-voice-id', 'Hana');
  const [text, setText] = useState('Hello! This is a test of the InWorld TTS viseme system.');
  const [logs, setLogs] = useState([]);

  const handleDebug = useCallback(
    entry => {
      setLogs(prev => [...prev, entry]);
    },
    []
  );

  const { status, currentViseme, connect, sendText, disconnect } = useInworldTTS({
    apiKey,
    voiceId,
    onDebug: handleDebug,
  });

  const isConnected = status === 'connected' || status === 'processing' || status === 'speaking';

  const handleSend = () => {
    if (!text.trim()) return;
    sendText(text.trim());
  };

  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey && isConnected) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Flori</h1>
        <span className={`status status-${status}`}>
          {STATUS_LABELS[status] || status}
        </span>
      </header>

      <div className="app-layout">
        <div className="panel panel-character">
          <RiveCharacter currentViseme={currentViseme} />
        </div>

        <div className="panel panel-controls">
          <div className="form-group">
            <label htmlFor="apiKey">API Key (Base64)</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
              placeholder="Your InWorld API key..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="voiceId">Voice ID</label>
            <input
              id="voiceId"
              type="text"
              value={voiceId}
              onChange={event => setVoiceId(event.target.value)}
              placeholder="e.g. Hana, Dennis, Ashley..."
            />
          </div>

          <div className="form-row">
            {!isConnected ?
              <button
                className="btn btn-primary"
                onClick={connect}
                disabled={!apiKey || status === 'connecting'}
              >
                Connect
              </button>
              :
              <button
                className="btn btn-secondary"
                onClick={disconnect}
              >
                Disconnect
              </button>
            }
          </div>

          <div className="form-group">
            <label htmlFor="text">Text to speak</label>
            <textarea
              id="text"
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type something..."
              rows={3}
              disabled={!isConnected}
            />
          </div>

          <div className="form-row">
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!isConnected || !text.trim() || status === 'processing'}
            >
              {status === 'processing' ? 'Processing...' : 'Send'}
            </button>
          </div>

          <DebugConsole logs={logs} />
        </div>
      </div>
    </div>
  );
};

export default App;
