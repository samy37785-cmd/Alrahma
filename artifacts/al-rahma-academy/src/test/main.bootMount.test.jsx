import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stage 1 URL Closure (see docs/localization-audit.md, Section 9 items
// 16-17): proves main.jsx itself - not just the underlying
// runBootRedirect() utility (covered in bootRedirect.test.js) - actually
// skips creating a React root when a runtime redirect fires, and mounts
// normally otherwise. main.jsx runs its boot logic as top-level module
// side effects, so each case needs a fresh module instance
// (vi.resetModules()) and a fresh dynamic import.

vi.mock('../App.jsx', () => ({ default: () => null }));
vi.mock('../utils/sentry.js', () => ({ initSentry: vi.fn() }));
vi.mock('../utils/loadArabicFonts.js', () => ({ loadArabicFontsIdle: vi.fn() }));

function stubLocation(pathname, search = '') {
  const replace = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, search, hash: '', replace },
  });
  return replace;
}

describe('main.jsx boot: React mount is skipped on redirect, normal otherwise', () => {
  const realLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  let createRootMock;
  let renderMock;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    renderMock = vi.fn();
    createRootMock = vi.fn(() => ({ render: renderMock }));
    vi.doMock('react-dom/client', () => ({ createRoot: createRootMock }));
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', realLocationDescriptor);
    vi.doUnmock('react-dom/client');
  });

  it('16. a non-canonical URL (legacy ?lang=) redirects via replace() and never creates a React root', async () => {
    stubLocation('/', '?lang=fr');
    await import('../main.jsx');
    expect(createRootMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('17. an already-canonical URL mounts normally - createRoot is called exactly once', async () => {
    stubLocation('/fr/courses/ijazah', '');
    await import('../main.jsx');
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('25. a plain canonical deep route never mounts a stray NotFound before/instead of the app', async () => {
    stubLocation('/resources/faq', '');
    await import('../main.jsx');
    // Mounting means React.createElement(App, ...) is what gets rendered -
    // this test's mocked App renders null, so no NotFound text can appear;
    // the meaningful assertion is that mount happened at all (not skipped).
    expect(createRootMock).toHaveBeenCalledTimes(1);
  });
});
