import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (served from our own origin = far faster than Google's
// gstatic CDN, and no render-blocking 3rd-party stylesheet). Amiri uses the
// Arabic subset only — Latin text is covered by Inter.
// Redesign (stitch-reference): Inter is the functional/body typeface across
// every data-heavy surface (weights 400/500/600/700). latin-ext covers the
// accented glyphs used by the it/es/de/fr locales so those pages never swap
// to a fallback mid-word.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-ext-700.css';
// Epilogue — the high-impact display typeface for headlines (--font-display).
// Per the design reference it carries display-hero (800), headline-lg (700)
// and headline-md (600). Self-hosted and loaded eagerly like Inter above so
// hero/section headings never font-swap after first paint.
import '@fontsource/epilogue/latin-600.css';
import '@fontsource/epilogue/latin-700.css';
import '@fontsource/epilogue/latin-800.css';
import '@fontsource/epilogue/latin-ext-700.css';
// Brand-lockup-only fonts (Header logo appears on every page, so loaded
// eagerly like Inter rather than lazily like Amiri below — a lazy-loaded
// logo wordmark would visibly font-swap on every single page load).
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cairo/arabic-700.css';
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
