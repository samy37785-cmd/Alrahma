import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

// T23 (monitoring & observability audit): Sentry is fully initialized in
// production (see main.jsx / utils/sentry.js), but this top-level error
// boundary previously only did console.error — React error boundaries
// intentionally stop a caught render error from ever becoming an uncaught
// exception, which is also how Sentry's automatic global handlers detect
// errors, so every crash this boundary caught was invisible in Sentry despite
// Sentry actively reporting everything else. Verifies the fix reports caught
// errors via captureException without changing the rendered fallback UI.

vi.mock('../utils/sentry.js', () => ({
  captureException: vi.fn(),
}));

import { captureException } from '../utils/sentry.js';

function Boom() {
  throw new Error('kaboom');
}

describe('ErrorBoundary Sentry reporting', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports the caught error to Sentry via captureException', () => {
    // Suppress the expected React error-boundary console noise for this test.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      consoleSpy.mockRestore();
    }

    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, context] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('kaboom');
    expect(context.extra).toHaveProperty('componentStack');
  });

  it('still renders the fallback crash UI unchanged', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      consoleSpy.mockRestore();
    }

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
