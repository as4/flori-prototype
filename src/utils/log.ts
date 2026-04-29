export type DebugEntry = {
  time: number;
  message: string;
  data?: string | Record<string, unknown>;
};

////////////////////////////////////////////////////////////////////////////////

const LOG_BUFFER_MAX = 500;
const CHANGE_EVENT = 'change';

let entries: DebugEntry[] = [];
const target = new EventTarget();

////////////////////////////////////////////////////////////////////////////////

export const log = (message: string, data?: DebugEntry['data']) => {
  const next = entries.concat({time: Date.now(), message, data});
  entries = next.length > LOG_BUFFER_MAX ? next.slice(-LOG_BUFFER_MAX) : next;
  target.dispatchEvent(new Event(CHANGE_EVENT));
};

export const getLogs = () => entries;

export const subscribeLogs = (listener: () => void) => {
  target.addEventListener(CHANGE_EVENT, listener);
  return () => {
    target.removeEventListener(CHANGE_EVENT, listener);
  };
};
