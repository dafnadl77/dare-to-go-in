/** Small vector icons for the map (the only pictures besides the one dream image). All decorative: the text next to them says it. */
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

export const CheckIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

/** Points toward reading-end; CSS flips it in RTL (.dm-flip). */
export const ChevronIcon = () => (
  <svg {...base} width={20} height={20} className="dm-flip">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const BackIcon = () => (
  <svg {...base} width={20} height={20} className="dm-flip">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const MoonIcon = () => (
  <svg {...base} width={34} height={34} strokeWidth={1.4}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

export const ImageIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5-8 8" />
  </svg>
);

export const SparkIcon = () => (
  <svg {...base} width={26} height={26}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...base}>
    <circle cx="6" cy="17" r="2.4" />
    <circle cx="18" cy="7" r="2.4" />
    <circle cx="17" cy="18" r="1.8" />
    <path d="M8 15.5l8-7M8.3 17.3l6.9.6" />
  </svg>
);

export const BookIcon = () => (
  <svg {...base}>
    <path d="M4 5.5c2.8-1 5.5-.8 8 1 2.5-1.8 5.2-2 8-1V19c-2.8-1-5.5-.8-8 1-2.5-1.8-5.2-2-8-1z" />
    <path d="M12 6.5V20" />
  </svg>
);

export const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z" />
  </svg>
);

export const CompassIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M15 9l-1.8 4.2L9 15l1.8-4.2z" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
