/**
 * Al-Rahma Academy — SVG Icon System
 * All icons are 20×20 viewBox, stroke-based (consistent weight).
 * Usage: <BookOpenIcon size={20} className="..." />
 */

const BASE = {
  viewBox: '0 0 20 20',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
};

function Svg({ size = 20, className = '', title, children, ...rest }) {
  return (
    <svg
      {...BASE}
      width={size} height={size}
      className={`icon ${className}`}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* ── Navigation icons ── */
export const BookOpenIcon = (p) => (
  <Svg {...p}><path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v11a2.5 2.5 0 01-2.5 2.5H10M2 4.5v11A2.5 2.5 0 004.5 18H10M10 2v16M6 6h2M6 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const StarIcon = (p) => (
  <Svg {...p}><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const ScrollIcon = (p) => (
  <Svg {...p}><path d="M6 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6m2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const MosqueIcon = (p) => (
  <Svg {...p}><path d="M3 18v-6a5 5 0 0110 0v6M8 18V9m4 0h3a2 2 0 012 2v7M1 12h2m14 0h2M8 6V4M10 4a2 2 0 11-4 0 2 2 0 014 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const AlphabetIcon = (p) => (
  <Svg {...p}><path d="M4 15l4-10 4 10M6 11h4M14 5l3 10M14 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const BeadsIcon = (p) => (
  <Svg {...p}><circle cx="10" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="18" cy="13" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="14" cy="18" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6c0 6 8 6 8 5M14 16C8 16 2 12 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const LibraryIcon = (p) => (
  <Svg {...p}><path d="M2 4h3v12H2V4zm5 0h3v12H7V4zm5 0h3v12h-3V4zm5 0h1v12h-1V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const CompassIcon = (p) => (
  <Svg {...p}><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13 7l-4 4-2 2 4-4 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const CalendarIcon = (p) => (
  <Svg {...p}><rect x="2" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 8h16M6 2v4M14 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const VerseIcon = (p) => (
  <Svg {...p}><path d="M10 3L12 8H17L13 11L14.5 16.5L10 13L5.5 16.5L7 11L3 8H8L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const HandIcon = (p) => (
  <Svg {...p}><path d="M8 4v6M10 3v7M12 4v6M14 6v4M6 9v2a4 4 0 008 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);

/* ── UI icons ── */
export const ChevronDownIcon = (p) => (
  <Svg {...p}><path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const SearchIcon = (p) => (
  <Svg {...p}><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const BellIcon = (p) => (
  <Svg {...p}><path d="M10 2a6 6 0 016 6v3l1.5 3H2.5L4 11V8a6 6 0 016-6zM8 16a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const SettingsIcon = (p) => (
  <Svg {...p}><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const LogoutIcon = (p) => (
  <Svg {...p}><path d="M13 5l4 5-4 5M17 10H7M3 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const MessageIcon = (p) => (
  <Svg {...p}><path d="M17 10c0 3.866-3.134 7-7 7a7.002 7.002 0 01-3.536-.95L3 17l.95-3.464A7 7 0 1117 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const CardIcon = (p) => (
  <Svg {...p}><rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 9h16" stroke="currentColor" strokeWidth="1.5"/></Svg>
);
export const ShieldIcon = (p) => (
  <Svg {...p}><path d="M10 2l7 3v5c0 4-3.5 7.5-7 8-3.5-.5-7-4-7-8V5l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const EditIcon = (p) => (
  <Svg {...p}><path d="M14 2l4 4-10 10H4v-4L14 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const GlobeIcon = (p) => (
  <Svg {...p}><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M2 10h16M10 2c-3 3-3 11 0 16M10 2c3 3 3 11 0 16" stroke="currentColor" strokeWidth="1.5"/></Svg>
);
export const LockIcon = (p) => (
  <Svg {...p}><rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 9V7a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const HomeIcon = (p) => (
  <Svg {...p}><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 18V12h4v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const UsersIcon = (p) => (
  <Svg {...p}><circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2 18c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="14" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M16 13.5c1.5.8 2.5 2.5 2.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const MoonIcon = (p) => (
  <Svg {...p}><path d="M17 10.5A7 7 0 019.5 3 7.5 7.5 0 1017 10.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></Svg>
);
export const SunIconOutline = (p) => (
  <Svg {...p}><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.22 3.22l1.42 1.42M15.36 15.36l1.42 1.42M3.22 16.78l1.42-1.42M15.36 4.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
export const TeacherIcon = (p) => (
  <Svg {...p}><rect x="3" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 17l3-3 3 3M10 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>
);
export const AboutIcon = (p) => (
  <Svg {...p}><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M10 9v6M10 7v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>
);
