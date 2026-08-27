import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN || import.meta.env.DEV) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release:     import.meta.env.VITE_APP_VERSION || 'unknown',
    tracesSampleRate:   0.2,
    replaysSessionSampleRate:   0.05,
    replaysOnErrorSampleRate:   1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText:   false,
        blockAllMedia: false,
      }),
    ],
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      'Network request failed',
      /^AbortError/,
    ],
  });
}

export const captureException = Sentry.captureException;
export const captureMessage   = Sentry.captureMessage;
export const setUser          = Sentry.setUser;
export const withProfiler     = Sentry.withProfiler;
export const ErrorBoundarySentry = Sentry.ErrorBoundary;
