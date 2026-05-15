// Logo + reusable inline SVGs. Kept in window-scope for cross-file access.

function Logo({ size = 'md', iconOnly = false }) {
  const dims = { sm: { icon: 24, text: 16 }, md: { icon: 32, text: 20 }, lg: { icon: 64, text: 40 } }[size];
  return (
    <span className="logo-wrap" style={{ '--icon-size': dims.icon + 'px' }}>
      <svg className="logo-mark" width={dims.icon} height={dims.icon} viewBox="0 0 64 64" fill="none" aria-label="respawn.kz logo">
        <defs>
          <linearGradient id={`pin-${size}`} x1="0" y1="0" x2="64" y2="64">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="60%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path d="M32 4 C18.7 4 8 14.5 8 27.5 C8 42 27 58 30.5 60.5 C31.4 61.2 32.6 61.2 33.5 60.5 C37 58 56 42 56 27.5 C56 14.5 45.3 4 32 4 Z" fill={`url(#pin-${size})`} />
        <path d="M18 14 A22 22 0 0 1 50 16 L46 12 M50 16 L44 18" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95" />
        <g transform="translate(18 22)" fill="#ffffff">
          <path d="M5 4 H23 C26 4 28 6 28 9 V15 C28 18 26 20 23 20 H20 L17.5 16 H10.5 L8 20 H5 C2 20 0 18 0 15 V9 C0 6 2 4 5 4 Z" />
          <rect x="5.5" y="10.5" width="6" height="2" fill="#3b5fdf" rx="0.5" />
          <rect x="7.5" y="8.5" width="2" height="6" fill="#3b5fdf" rx="0.5" />
          <circle cx="20" cy="9.5" r="1.3" fill="#3b5fdf" />
          <circle cx="23" cy="12" r="1.3" fill="#3b5fdf" />
          <circle cx="20" cy="14.5" r="1.3" fill="#3b5fdf" />
          <circle cx="17" cy="12" r="1.3" fill="#3b5fdf" />
        </g>
      </svg>
      {!iconOnly && (
        <span className="logo-text" style={{ fontSize: dims.text + 'px' }}>
          <span className="logo-text__main">RESPAWN</span><span className="logo-text__accent">.kz</span>
        </span>
      )}
    </span>
  );
}

const Icons = {
  Pin: () => (<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="64" height="64"><path d="M32 8 C22 8 14 16 14 26 C14 38 32 56 32 56 C32 56 50 38 50 26 C50 16 42 8 32 8 Z"/><circle cx="32" cy="26" r="6"/></svg>),
  Calendar: () => (<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="64" height="64"><rect x="10" y="14" width="44" height="42" rx="4"/><path d="M10 24 H54"/><path d="M22 8 V20 M42 8 V20"/><path d="M22 36 H30 M22 44 H42"/></svg>),
  Gamepad: () => (<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="64" height="64"><rect x="8" y="22" width="48" height="28" rx="14"/><circle cx="20" cy="36" r="3" fill="currentColor"/><circle cx="44" cy="32" r="2" fill="currentColor"/><circle cx="48" cy="40" r="2" fill="currentColor"/><path d="M16 30 V42 M12 36 H20"/></svg>),
  Booking: () => (<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="22" height="20" rx="3"/><path d="M3 11 H25"/><path d="M9 2 V8 M19 2 V8"/><path d="M9 17 L13 21 L21 13"/></svg>),
  Card: () => (<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="24" height="16" rx="3"/><path d="M2 11 H26"/><path d="M6 17 H10 M14 17 H18"/></svg>),
  Shield: () => (<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2 L4 6 V14 C4 20 14 26 14 26 C14 26 24 20 24 14 V6 Z"/><path d="M9 14 L13 18 L19 11"/></svg>),
  Medal: () => (<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="14" cy="14" r="11"/><path d="M14 7 L16 12 L22 12 L17 15 L19 21 L14 17 L9 21 L11 15 L6 12 L12 12 Z" fill="currentColor" stroke="none"/></svg>),
};

Object.assign(window, { Logo, Icons });
