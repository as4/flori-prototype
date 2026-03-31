import { useState } from 'react';
import { VISEME_TO_ID } from '../hooks/useInworldTTS';

const VISEME_MOUTHS = {
  sil: { label: 'Silent', mouth: '—' },
  aei: { label: 'AEI', mouth: '😮' },
  o: { label: 'O', mouth: '😯' },
  ee: { label: 'EE', mouth: '😁' },
  bmp: { label: 'BMP', mouth: '😐' },
  fv: { label: 'FV', mouth: '🫦' },
  l: { label: 'L', mouth: '😛' },
  r: { label: 'R', mouth: '😬' },
  th: { label: 'TH', mouth: '😝' },
  qw: { label: 'QW', mouth: '😗' },
  cdgknstxyz: { label: 'CDGK...', mouth: '😶' },
};

// SVG mouth shapes — simplified front-view lips for each viseme
const SvgMouth = ({ viseme }) => {
  const shapes = {
    sil: (
      <path d="M30 50 Q50 52 70 50" stroke="#e8e8f0" strokeWidth="3" fill="none" strokeLinecap="round" />
    ),
    aei: (
      <ellipse cx="50" cy="50" rx="18" ry="22" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
    o: (
      <ellipse cx="50" cy="50" rx="14" ry="18" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
    ee: (
      <ellipse cx="50" cy="50" rx="20" ry="8" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
    bmp: (
      <path d="M30 50 Q50 48 70 50 Q50 52 30 50 Z" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
    fv: <>
      <path d="M30 47 Q50 44 70 47" stroke="#e8e8f0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M32 50 Q50 56 68 50" stroke="#e8e8f0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <line x1="30" y1="53" x2="70" y2="53" stroke="#e8e8f0" strokeWidth="1" opacity="0.4" />
    </>,
    l: <>
      <ellipse cx="50" cy="50" rx="16" ry="12" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
      <ellipse cx="50" cy="42" rx="6" ry="4" fill="#d77" />
    </>,
    r: (
      <ellipse cx="50" cy="50" rx="10" ry="12" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
    th: <>
      <path d="M30 48 Q50 44 70 48" stroke="#e8e8f0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M30 52 Q50 56 70 52" stroke="#e8e8f0" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="50" rx="8" ry="3" fill="#d77" />
    </>,
    qw: (
      <ellipse cx="50" cy="50" rx="8" ry="10" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
    cdgknstxyz: (
      <path d="M32 50 Q50 54 68 50 Q50 56 32 50 Z" fill="#c44" stroke="#e8e8f0" strokeWidth="2" />
    ),
  };

  return (
    <svg viewBox="0 0 100 100" width="120" height="120">
      <circle cx="50" cy="50" r="45" fill="#1a1b21" stroke="#2a2b33" strokeWidth="2" />
      {shapes[viseme] || shapes.sil}
    </svg>
  );
};

const VisemeFallback = ({ currentViseme }) => {
  const [mode, setMode] = useState('emoji');
  const visemeId = VISEME_TO_ID[currentViseme] ?? 0;
  const { label, mouth } = VISEME_MOUTHS[currentViseme] ?? VISEME_MOUTHS.sil;

  return (
    <div className="viseme-fallback">
      <div className="viseme-mode-toggle">
        <button
          className={mode === 'emoji' ? 'active' : ''}
          onClick={() => setMode('emoji')}
        >
          Emoji
        </button>
        <button
          className={mode === 'svg' ? 'active' : ''}
          onClick={() => setMode('svg')}
        >
          SVG
        </button>
      </div>

      <div className="viseme-mouth">
        {mode === 'emoji' ?
          mouth
          :
          <SvgMouth viseme={currentViseme} />
        }
      </div>
      <div className="viseme-label">{label}</div>
      <div className="viseme-id">ID: {visemeId}</div>
    </div>
  );
};

export default VisemeFallback;
