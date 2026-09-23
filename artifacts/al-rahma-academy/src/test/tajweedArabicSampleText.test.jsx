import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import TajweedCheckerPage from '../pages/tools/TajweedCheckerPage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same Header/Footer provider mocks as the other Language Closure phases —
// neither is touched by this fix.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// Language Closure Phase 3 (policy approved by محمود): /ar/tools/tajweed-checker
// showed a full English sentence ("In the name of Allah, the Most Gracious,
// the Most Merciful") as the practice-verse "translation", unconditionally,
// regardless of `lang`. Confirmed by reading TajweedCheckerPage.jsx and
// i18n/tools/tajweedChecker.js in full: VERSES[*].arabic is the real,
// authoritative Quran Arabic text and was already correct and already
// rendered unconditionally — the fix only hides the English `translation`
// gloss on the Arabic page (showTranslation = lang !== 'ar'). No Quran text
// was invented; VERSES[0].arabic ('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ')
// already matches the approved Basmalah text verbatim. transliteration and
// ref stay untouched — out of scope for this phase (tracked separately).

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

describe('Tajweed Checker: Arabic page never shows the English sample translation', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('Arabic (/ar/tools/tajweed-checker): shows the real Arabic verse (Basmalah), no English translation paragraph', () => {
    const { container } = renderHarness('/ar/tools/tajweed-checker');

    const arabicEl = container.querySelector('.tajweed__arabic');
    expect(arabicEl.textContent).toBe('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');
    expect(container.querySelector('.tajweed__translation')).toBeNull();
    expect(container.textContent).not.toContain('In the name of Allah');
  });

  it('English (/tools/tajweed-checker): still shows the translation paragraph — unchanged', () => {
    const { container } = renderHarness('/tools/tajweed-checker');

    const transEl = container.querySelector('.tajweed__translation');
    expect(transEl).not.toBeNull();
    expect(transEl.textContent).toBe('In the name of Allah, the Most Gracious, the Most Merciful');
  });

  it('all six practice verses: Arabic page shows no translation paragraph for any verse', () => {
    const { container } = renderHarness('/ar/tools/tajweed-checker');
    const tabs = container.querySelectorAll('.tajweed__verse-tab');
    expect(tabs.length).toBe(6);
    for (const tab of tabs) {
      tab.click();
      expect(container.querySelector('.tajweed__translation')).toBeNull();
    }
  });

  it('lang/dir and title/canonical are correct and unaffected by this fix', () => {
    renderHarness('/ar/tools/tajweed-checker');
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.title).toBe('مدقق التجويد بالذكاء الاصطناعي | AL-Rahma Academy');
  });
});

describe('TajweedCheckerPage.jsx source: minimal, scoped diff', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../pages/tools/TajweedCheckerPage.jsx'), 'utf8');

  it('derives showTranslation without an isAr/lang===\'ar\' ternary (keeps the existing no-ternary guard passing)', () => {
    expect(src).toMatch(/const showTranslation = lang !== 'ar';/);
    expect(src).not.toMatch(/(isAr|lang\s*===\s*['"]ar['"])\s*\?/);
  });

  it('gates only the translation paragraph, leaving arabic/transliteration/ref unconditional', () => {
    expect(src).toMatch(/\{showTranslation && <p className="tajweed__translation">\{verse\.translation\}<\/p>\}/);
    expect(src).toMatch(/<p className="tajweed__arabic" lang="ar" dir="rtl">\{verse\.arabic\}<\/p>/);
    expect(src).toMatch(/<p className="tajweed__transliteration">\{verse\.transliteration\}<\/p>/);
  });

  it('does not touch SpeechRecognition, scoring logic, or button/permission handling', () => {
    expect(src).toMatch(/rec\.lang = 'ar-SA';/);
    expect(src).toMatch(/function similarity\(a, b\)/);
    expect(src).toMatch(/const startListening = useCallback/);
  });

  it('VERSES data is untouched (no new Quran text invented)', () => {
    expect(src).toMatch(/arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'/);
    expect((src.match(/translation:/g) || []).length).toBe(6);
  });
});
