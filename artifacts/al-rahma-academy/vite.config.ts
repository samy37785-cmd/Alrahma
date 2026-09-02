import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { canonicalRedirectMiddleware } from './src/utils/canonicalRedirectMiddleware.js';

const rawPort = process.env.PORT ?? '19795';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

// Stage 1 URL Closure (see docs/localization-audit.md): permanent (308)
// redirects to the canonical URL, using the exact same decision as the
// browser runtime fallback (src/utils/bootRedirect.js) - both call
// computeCanonicalUrl() and never re-implement any part of it. An HTTP
// request never carries a hash fragment, so this only ever sees/redirects
// on pathname + query; hash preservation is proven at the runtime-utility
// level instead (see src/utils/urlCanonicalize.js's docs).
//
// computeCanonicalRedirect() also gates on method (GET/HEAD only) - a 308
// must never fire for a non-idempotent request, even though /api/* is
// already excluded and no non-GET route should ever reach this SPA-serving
// layer in practice; the guard is explicit rather than assumed.
//
// The actual req/res wiring (statusCode/Location/end()/next()) lives in
// canonicalRedirectMiddleware.js so it can be unit-tested directly rather
// than only through computeCanonicalRedirect()'s pure decision logic — see
// src/test/canonicalRedirectMiddleware.test.js.
const canonicalUrlRedirect = () => ({
  name: 'canonical-url-redirect',
  configureServer(server) {
    server.middlewares.use(canonicalRedirectMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use(canonicalRedirectMiddleware);
  },
});

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    canonicalUrlRedirect(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
