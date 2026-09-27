import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../../context/LangContext';
import { AuthProvider } from '../../context/AuthContext';
import { AdminAuthProvider } from '../../context/AdminAuthContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { langFromPath } from '../../utils/localePath';

// Renders a whole page component inside the same providers App.jsx uses, with
// every DeferredSection mounted, for tests that inspect a page's complete
// output (French Localization Batch 1A).

// Deterministic render: fixed clock (TrustBar's Cairo-hours status and the
// Footer year read Date), no IntersectionObserver so every DeferredSection
// mounts its real content, and no network.
export function useFullPageEnvironment() {
  let savedIO;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    savedIO = window.IntersectionObserver;
    delete window.IntersectionObserver;
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in test'))));
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (savedIO) window.IntersectionObserver = savedIO;
  });
  afterEach(() => {
    cleanup();
    document.title = '';
    window.localStorage.clear();
  });
}

export async function mountFullPage(urlPath, Page) {
  window.history.replaceState({}, '', urlPath);
  const { basename } = langFromPath(urlPath);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <BrowserRouter basename={basename}>
            <LangProvider>
              <AuthProvider>
                <AdminAuthProvider>
                  <Page />
                </AdminAuthProvider>
              </AuthProvider>
            </LangProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );
  });
  // Let deferred sections and effects settle.
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
}

export function headMeta(selector) {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

// Every visible text node plus every aria-label / title / alt / placeholder
// in the rendered body, whitespace-collapsed.
export function bodyStrings() {
  const out = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (text && !node.parentElement.closest('script, style, noscript')) out.add(text);
  }
  for (const el of document.body.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
    for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (value) out.add(`@${attr}: ${value}`);
    }
  }
  return out;
}
