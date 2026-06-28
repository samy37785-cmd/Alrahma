import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
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

const rootElement = document.getElementById('root');
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// react-snap prerenders each public route to static HTML at build time.
// If the root already has server-rendered markup, hydrate it (keeps the
// prerendered HTML for SEO/first paint); otherwise mount fresh as usual.
if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}

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
