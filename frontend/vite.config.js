import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/', 'dist/'],
    },
  },
  plugins: [
    react(),
    // Cross-browser support for older phones. Without this, Vite ships only a
    // modern ESM bundle (Chrome 87+/Safari 14+), so older Android/iOS/Samsung
    // Internet browsers couldn't parse the JS and the page failed to load.
    // plugin-legacy emits a transpiled + polyfilled `nomodule` fallback bundle
    // that those browsers load instead; modern browsers ignore it entirely.
    legacy({
      // Broad device coverage: covers every phone in our supported device list
      // (2010–2026) as far as the browser engine allows.
      //
      // Modern bundle (type="module") is served to Safari 11+ / Chrome 61+ / iOS 11+.
      // Everything older receives this transpiled + polyfilled nomodule bundle:
      //   iOS >= 9      → iPhone 4S (max iOS 9), iPhone 5/5c (max iOS 10)
      //   Android >= 4  → Android 4.x phones from 2011-2013 (Galaxy S II, Nexus 4…)
      //   Chrome >= 49  → last Chrome release that ran on Android 4.x
      //   Samsung >= 4  → Samsung Internet 4.0 (shipped on older Galaxy devices)
      //   Firefox >= 52 → Firefox ESR floor
      //   Opera >= 64, OperaMobile >= 64 → Opera users on mid-range Androids
      //   UCAndroid >= 12 → UC Browser (popular on budget Asian/African phones)
      //   QQAndroid >= 11 → QQ Browser (common in China)
      //   Baidu >= 7    → Baidu Browser (common in China)
      //   KaiOS >= 2.5  → KaiOS feature phones (popular in Africa/India)
      //
      // Phones older than ~2012 (Android 2.x, iPhone 4 / iOS 7) run browsers
      // that predate <script nomodule> detection and lack ES5 Array methods that
      // even core-js cannot back-fill at runtime; they are beyond what any modern
      // React build can realistically target.
      targets: [
        'defaults',
        'iOS >= 9',
        'Android >= 4',
        'Chrome >= 49',
        'Samsung >= 4',
        'Firefox >= 52',
        'Opera >= 64',
        'OperaMobile >= 64',
        'UCAndroid >= 12',
        'QQAndroid >= 11',
        'Baidu >= 7',
        'KaiOS >= 2.5',
        'not IE 11',
      ],
      // Polyfill modern JS features in the legacy (nomodule) bundle via core-js.
      // modernPolyfills is intentionally OFF: the modern bundle targets es2015/
      // safari11 and our runtime APIs (fetch, Promise, IntersectionObserver —
      // with a fallback) are all supported there, so modern users stay lean.
      polyfills: true,
      // Explicitly pull in regenerator-runtime so async/await works on old
      // Android WebViews (Chrome 49) and Safari 9 that lack native generators.
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  build: {
    // Transpile modern syntax (??, ?., etc.) down to ES2015 so the *modern*
    // bundle also runs on any browser that supports ES modules (Safari 11+,
    // Chrome 61+, iOS 11+), not just very recent ones.
    target: ['es2015', 'safari11'],
    rollupOptions: {
      output: {
        // Function form lets us pattern-match node_modules paths, which is more
        // reliable than the object form for packages with sub-packages (e.g. Sentry
        // has @sentry/core, @sentry/browser, etc. all needing the same chunk).
        manualChunks(id) {
          // Normalise to forward slashes so patterns work on Windows and Unix.
          const fwd = id.replaceAll('\\', '/');
          // Core UI runtime — changes only on React/Router upgrades
          if (fwd.includes('/node_modules/react/') ||
              fwd.includes('/node_modules/react-dom/') ||
              fwd.includes('/node_modules/react-router-dom/') ||
              fwd.includes('/node_modules/react-router/') ||
              fwd.includes('/node_modules/scheduler/')) {
            return 'react-vendor';
          }
          // Data-fetching SDK — changes independently of UI runtime
          if (fwd.includes('/node_modules/@tanstack/')) {
            return 'query-vendor';
          }
          // Sentry error/analytics SDK — large and very rarely updated
          if (fwd.includes('/node_modules/@sentry/')) {
            return 'sentry-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true, // fail rather than auto-increment; a port bump breaks HMR WebSocket
    open: true,
    host: true, // expose on the local network so phones on the same Wi-Fi can open it
    proxy: {
      // Forward API calls through the dev server, so they work from any device
      // (phone hits <PC-IP>:5173/api → proxied to the backend on the PC).
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
