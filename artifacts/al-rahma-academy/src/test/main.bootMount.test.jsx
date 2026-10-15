import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stage 1 URL Closure (see docs/localization-audit.md, Section 9 items
// 16-17): proves main.jsx itself - not just the underlying
// runBootRedirect() utility (covered in bootRedirect.test.js) - actually
// skips creating a React root when a runtime redirect fires, and mounts
// normally otherwise. main.jsx runs its boot logic as top-level module
// side effects, so each case needs a fresh module instance
// (vi.resetModules()) and a fresh dynamic import.

const preloadInitialPageMock = vi.fn(() => Promise.resolve());
vi.mock('../App.jsx', () => ({ default: () => null, preloadInitialPage: (...args) => preloadInitialPageMock(...args) }));
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
  let loadTranslationsMock;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    renderMock = vi.fn();
    createRootMock = vi.fn(() => ({ render: renderMock }));
    vi.doMock('react-dom/client', () => ({ createRoot: createRootMock }));
    // main.jsx mounts once this page's language dictionary has loaded.
    loadTranslationsMock = vi.fn(() => Promise.resolve({}));
    vi.doMock('../i18n/index.js', async (importOriginal) => ({ ...(await importOriginal()), loadTranslations: loadTranslationsMock }));
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', realLocationDescriptor);
    vi.doUnmock('react-dom/client');
    vi.doUnmock('../i18n/index.js');
  });

  it('16. a non-canonical URL (legacy ?lang=) redirects via replace() and never creates a React root', async () => {
    stubLocation('/', '?lang=fr');
    await import('../main.jsx');
    await new Promise((r) => setTimeout(r, 0));
    expect(createRootMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
    expect(loadTranslationsMock).not.toHaveBeenCalled();
  });

  it('17. an already-canonical URL mounts normally - createRoot is called exactly once', async () => {
    stubLocation('/fr/courses/ijazah', '');
    await import('../main.jsx');
    await vi.waitFor(() => expect(createRootMock).toHaveBeenCalledTimes(1));
    expect(renderMock).toHaveBeenCalledTimes(1);
    // Only the page's own language is downloaded, before the first render.
    expect(loadTranslationsMock.mock.calls).toEqual([['fr']]);
  });

  it('an English page loads only the English dictionary', async () => {
    stubLocation('/resources/faq', '');
    await import('../main.jsx');
    await vi.waitFor(() => expect(createRootMock).toHaveBeenCalledTimes(1));
    expect(loadTranslationsMock.mock.calls).toEqual([['en']]);
  });

  it('loads the current page (path without the language prefix) before the first render (#250)', async () => {
    preloadInitialPageMock.mockClear();
    stubLocation('/fr/courses/ijazah', '');
    await import('../main.jsx');
    await vi.waitFor(() => expect(createRootMock).toHaveBeenCalledTimes(1));
    expect(preloadInitialPageMock.mock.calls).toEqual([['/courses/ijazah']]);
  });

  it('a failed page preload still mounts the app', async () => {
    preloadInitialPageMock.mockImplementationOnce(() => Promise.reject(new Error('chunk failed')));
    stubLocation('/it/', '');
    await import('../main.jsx');
    await vi.waitFor(() => expect(createRootMock).toHaveBeenCalledTimes(1));
  });

  it('if the language chunk cannot be fetched, it falls back to English and still mounts', async () => {
    loadTranslationsMock.mockImplementation((lang) => (lang === 'it' ? Promise.reject(new Error('chunk failed')) : Promise.resolve({})));
    stubLocation('/it/', '');
    await import('../main.jsx');
    await vi.waitFor(() => expect(createRootMock).toHaveBeenCalledTimes(1));
    expect(loadTranslationsMock.mock.calls).toEqual([['it'], ['en']]);
  });

  it('25. a plain canonical deep route never mounts a stray NotFound before/instead of the app', async () => {
    stubLocation('/resources/faq', '');
    await import('../main.jsx');
    await vi.waitFor(() => expect(createRootMock).toHaveBeenCalled());
    // Mounting means React.createElement(App, ...) is what gets rendered -
    // this test's mocked App renders null, so no NotFound text can appear;
    // the meaningful assertion is that mount happened at all (not skipped).
    expect(createRootMock).toHaveBeenCalledTimes(1);
  });
});
