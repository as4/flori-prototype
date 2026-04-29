import {useRef, useEffect} from 'react';
import type {DebugEntry} from '../utils/log';

////////////////////////////////////////////////////////////////////////////////

type DebugConsoleProps = {
  logs: DebugEntry[];
};

////////////////////////////////////////////////////////////////////////////////

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

////////////////////////////////////////////////////////////////////////////////

const DebugConsole = ({logs}: DebugConsoleProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  //--------------------------------------------------------------------------
  //
  //  Effects
  //
  //--------------------------------------------------------------------------

  useEffect(
    () => {
      const container = containerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    },
    [logs]
  );

  ////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="debug-console">
      <div className="debug-header">Debug Console</div>
      <div className="debug-logs" ref={containerRef}>
        {logs.map(
          (entry, index) => (
            <div key={index} className="debug-entry">
              <span className="debug-time">{formatTime(entry.time)}</span>
              <span className="debug-message">{entry.message}</span>
              {
                entry.data &&
                <span className="debug-data">
                  {
                    typeof entry.data === 'string' ?
                      entry.data
                      :
                      JSON.stringify(entry.data)
                  }
                </span>
              }
            </div>
          )
        )}
        {
          logs.length === 0 &&
          <div className="debug-empty">Waiting for events...</div>
        }
      </div>
    </div>
  );
};

export default DebugConsole;
