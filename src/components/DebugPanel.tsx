import {useState, useSyncExternalStore} from 'react';
import _ from 'lodash';
import DebugConsole from './DebugConsole';
import {getLogs, subscribeLogs} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

const formatLogsForCopy = () => _.map(
  getLogs(),
  entry => {
    const time = new Date(entry.time).toISOString().slice(11, 23);
    const data = entry.data ?
      ' ' + (typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data))
      :
      '';
    return `${time} ${entry.message}${data}`;
  }
).join('\n');

////////////////////////////////////////////////////////////////////////////////

const DebugPanelBody = () => {
  const logs = useSyncExternalStore(subscribeLogs, getLogs);
  return (
    <DebugConsole logs={logs}/>
  );
};

////////////////////////////////////////////////////////////////////////////////

const DebugPanel = () => {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const text = formatLogsForCopy();
    try {
      await navigator.clipboard.writeText(text || '(no logs yet)');
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1500);
  };

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <details
      className="debug-wrapper"
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary>
        Debug console
        <button
          className="link-btn"
          type="button"
          onClick={handleCopy}
        >
          {
            copyState === 'copied' ?
              'Copied!'
              :
              copyState === 'failed' ?
                'Copy failed'
                :
                'Copy logs'
          }
        </button>
      </summary>
      {
        open &&
        <DebugPanelBody/>
      }
    </details>
  );
};

export default DebugPanel;
