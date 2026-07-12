import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (served from our own origin = far faster than Google's
// gstatic CDN, and no render-blocking 3rd-party stylesheet). Amiri uses the
// Arabic subset only — Latin text is covered by Poppins.
// Only 4 weights now (was 5): every font-weight:500 use in the codebase was
// consolidated to 600 (visually near-identical — Medium vs SemiBold) so this
// file doesn't need to be fetched at all. It was empirically the file
// implicated in a reproducible mobile CLS bug on the Teachers page: on a
// throttled connection all 8 Poppins files used to land in one late batch,
// and removing the least-used one shrinks that batch and the odds of any
// single page's text swapping fonts (and reflowing) after first paint.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';
import '@fontsource/poppins/latin-ext-400.css';
import '@fontsource/poppins/latin-ext-600.css';
import '@fontsource/poppins/latin-ext-700.css';
// NOTE: Amiri (Arabic) is heavy (~200 KB) and is the biggest item in the
// render critical path, yet it's only needed for Arabic-script text. It is
// loaded lazily after first paint (see loadArabicFonts below) so it no longer
// blocks the initial render. Arabic text shows in the system fallback for a
// fraction of a second, then swaps to Amiri (font-display: swap).
import App from './App.jsx';
import './styles.css';
import { initSentry } from './utils/sentry.js';
import { loadArabicFontsIdle } from './utils/loadArabicFonts.js';

initSentry();

const rootElement = document.getElementById('root');
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Client-side render. createRoot cleanly replaces the static #app-loading
// spinner (in index.html) with the rendered app — the spinner gives an instant
// first paint while this bundle loads instead of a blank white screen.
createRoot(rootElement).render(app);

// Load the heavy Arabic (Amiri) fonts off the critical path, once the browser
// is idle after the first paint. Vite emits these as async CSS chunks.
// Arabic-heavy pages (Teachers, Quran) trigger this immediately on mount
// instead — see loadArabicFonts.js.
loadArabicFontsIdle();

// Service worker: production only. sw.js caches non-HTML GET requests
// cache-first assuming Vite's content-hashed build filenames (safe — a new
// deploy gets new hashes, so stale cache entries are simply orphaned). In
// `vite dev`, source files are served unhashed at a stable URL and change on
// every edit, so the same cache-first rule would instead pin the browser to
// whatever version of a file it first saw — indefinitely, even across
// restarts — which is exactly the "why does my dev server show old code"
// trap this guard avoids. `vite preview` serves the real hashed build output
// and is unaffected (import.meta.env.DEV is false there too).
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
