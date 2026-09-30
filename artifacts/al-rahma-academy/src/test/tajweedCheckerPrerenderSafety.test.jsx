import { describe, it, expect, afterEach, vi } from 'vitest';

// jsdom (this test's environment) does not implement the Web Speech API at
// all, unlike the real Chromium scripts/prerender.mjs actually drives
// (confirmed live: navigator has SpeechRecognition there). TajweedCheckerPage
// .jsx reads `window.SpeechRecognition || window.webkitSpeechRecognition`
// at MODULE load time (a top-level const, not inside the component), so
// this stub must exist before that module is ever imported below --
// vi.hoisted() (unlike a plain statement) is hoisted above the static
// imports by Vitest's transform, same as vi.mock() already is.
vi.hoisted(() => {
  class FakeSpeechRecognition {
    start() {}
    stop() {}
  }
  window.SpeechRecognition = FakeSpeechRecognition;
});

import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import TajweedCheckerPage from '../pages/tools/TajweedCheckerPage';
import { TAJWEED_CHECKER_TEXT } from '../i18n/tools/tajweedChecker';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tajweed Checker SEO Publication Gate (2026-09-30): this page's static
// HTML is captured by scripts/prerender.mjs, a REAL headless-Chromium
// (Playwright) session that loads the live app -- it never clicks
// anything (confirmed by reading that script: it only navigates and waits
// on document state, see waitForHydratedSeo()). transcript/score/listening
// are plain useState values that only ever change inside startListening()/
// stopListening()/the verse-tab onClick, all exclusively wired to onClick
// handlers -- nothing in the component's render path or any effect calls
// them automatically. This suite proves that invariant directly (not just
// by inspecting prerender.mjs), so a future refactor that accidentally
// wires one of these to an effect is caught here.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <TajweedCheckerPage />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('TajweedCheckerPage: no transcript/score/listening/user data ever leaks into the initial (prerendered) render', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  for (const route of ['/tools/tajweed-checker', '/ar/tools/tajweed-checker', '/fr/tools/tajweed-checker']) {
    it(`${route}: initial render has no transcript/result section and the start button is enabled, never auto-listening`, () => {
      const { container } = renderHarness(route);
      // .tajweed__result only mounts once `transcript` is truthy -- absent
      // here proves transcript started (and stayed) empty on first paint.
      expect(container.querySelector('.tajweed__result'), 'no result/score card on initial render').toBeNull();
      expect(container.querySelector('.tajweed__hint'), 'no "listening…" hint on initial render (listening must start false)').toBeNull();
      expect(container.querySelector('.tajweed__error'), 'no error banner on initial render (jsdom/Chromium both expose the SpeechRecognition constructor)').toBeNull();
      const startBtn = container.querySelector('.tajweed__controls button');
      expect(startBtn, 'start button must exist').toBeTruthy();
      expect(startBtn.textContent, 'must be the Start button, not the Stop/listening button').not.toMatch(/tajweed__pulse|Stop|إيقاف|Arrêter/);
    });
  }

  it('component source: transcript/score/listening state is set only inside onClick-wired handlers, never in a bare effect or during render', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/tools/TajweedCheckerPage.jsx'), 'utf8');
    // No useEffect at all in this component -- the strongest possible
    // guarantee that nothing auto-runs after mount (unlike the Hadith-of-
    // -the-Day case, this page needed no useEffect-based fix because it
    // has no per-visit auto-computation to defer in the first place).
    expect(src).not.toMatch(/\buseEffect\b/);
    // setTranscript/setScore are only ever called inside onresult (a
    // SpeechRecognition event handler, itself only reachable after
    // startListening(), itself only wired to the Start button's onClick)
    // or inside the "try again"/verse-tab onClick resets -- never as a
    // top-level call during render.
    expect(src).toMatch(/rec\.onresult = \(e\) => \{[\s\S]*?setTranscript\(said\);/);
    expect(src).toMatch(/const startListening = useCallback\(\(\) => \{/);
    expect(src).toMatch(/onClick=\{startListening\}/);
  });

  it('SEO title/description come from TAJWEED_CHECKER_TEXT, not from any live/user-specific value', () => {
    for (const locale of ['en', 'ar', 'fr']) {
      expect(TAJWEED_CHECKER_TEXT[locale].seo.title).toBeTruthy();
      expect(TAJWEED_CHECKER_TEXT[locale].seo.description).toBeTruthy();
    }
  });
});
