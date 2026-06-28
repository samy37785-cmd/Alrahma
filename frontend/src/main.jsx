import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (served from our own origin = far faster than Google's
// gstatic CDN, and no render-blocking 3rd-party stylesheet). Amiri uses the
// Arabic subset only — Latin text is covered by Poppins.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
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
const loadArabicFonts = () => {
  import('@fontsource/amiri/arabic-400.css');
  import('@fontsource/amiri/arabic-700.css');
};
if ('requestIdleCallback' in window) {
  requestIdleCallback(loadArabicFonts, { timeout: 2000 });
} else {
  setTimeout(loadArabicFonts, 1200);
}
