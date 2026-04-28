import {useEffect, useRef} from 'react';

////////////////////////////////////////////////////////////////////////////////

export type TranscriptTurn = {
  role: 'user' | 'assistant';
  text: string;
};

type Props = {
  turns: TranscriptTurn[];
  onReset: () => void;
};

const Transcript = ({turns, onReset}: Props) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Sticky-bottom auto-scroll: only follow new messages if the user is
  // already near the bottom. Scrolling up to read older turns pins the view
  // there until they scroll back down.
  const stickyBottomRef = useRef(true);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const {scrollTop, scrollHeight, clientHeight} = event.currentTarget;
    stickyBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  useEffect(
    () => {
      const body = bodyRef.current;
      if (body && stickyBottomRef.current) body.scrollTop = body.scrollHeight;
    },
    [turns]
  );

  if (turns.length === 0) return null;

  return (
    <div className="transcript">
      <div className="transcript-header">
        <span>Conversation</span>
        <button
          className="transcript-reset"
          type="button"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
      <div
        ref={bodyRef}
        className="transcript-body"
        onScroll={handleScroll}
      >
        {turns.map(
          (turn, index) => (
            <div key={index} className={`transcript-turn transcript-${turn.role}`}>
              <span className="transcript-role">{turn.role === 'user' ? 'You' : 'Flori'}</span>
              <span className="transcript-text">{turn.text}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default Transcript;
