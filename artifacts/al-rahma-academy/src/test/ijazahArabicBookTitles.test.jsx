import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import CourseIjazah from '../pages/CourseIjazah';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same Header/Footer provider mocks as the other Language Closure phases —
// neither is touched by this fix.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// Language Closure Phase 5 (policy approved by محمود): the 4 Ijazah book
// cards on /courses/ijazah always showed book.title (English) as the
// primary bold title, with book.ar (Arabic) only as a secondary rtl line --
// on every language, including Arabic. BookCard (defined inline in
// CourseIjazah.jsx) now shows book.ar as the primary title when
// lang === 'ar'. BOOKS itself (title/ar/author/stage/desc/topics/link/
// linkLabel) is untouched -- these 4 Arabic titles already existed in
// CourseIjazah.jsx and are pre-approved by محمود; no other data file was
// touched.
const EXPECTED = [
  ['Tuhfat Al-Atfal', 'تحفة الأطفال'],
  ['Matn Al-Jazariyyah', 'متن الجزرية'],
  ['Matn Al-Shatibiyyah', 'متن الشاطبية'],
  ["Madinah Mus'haf", 'مصحف المدينة النبوية'],
];

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <CourseIjazah />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

function primaryTitles(container) {
  return Array.from(container.querySelectorAll('.cl__book strong')).map((el) => el.textContent);
}

describe('Ijazah books: Arabic page shows the Arabic title as primary', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('Arabic (/ar/courses/ijazah): all 4 books show their Arabic title as the primary title', () => {
    const { container } = renderHarness('/ar/courses/ijazah');
    const titles = primaryTitles(container);
    expect(titles.length).toBe(4);
    for (const [, ar] of EXPECTED) {
      expect(titles).toContain(ar);
    }
  });

  it('Arabic (/ar/courses/ijazah): none of the 4 English titles appear as a primary title', () => {
    const { container } = renderHarness('/ar/courses/ijazah');
    const titles = primaryTitles(container);
    for (const [en] of EXPECTED) {
      expect(titles).not.toContain(en);
    }
  });

  it('English (/courses/ijazah): unchanged — English title primary, Arabic shown as secondary line', () => {
    const { container } = renderHarness('/courses/ijazah');
    const titles = primaryTitles(container);
    expect(titles.length).toBe(4);
    for (const [en] of EXPECTED) {
      expect(titles).toContain(en);
    }
    const secondaryAr = Array.from(container.querySelectorAll('.cl__book .cl__book-ar')).map((el) => el.textContent);
    expect(secondaryAr.length).toBe(4);
    for (const [, ar] of EXPECTED) {
      expect(secondaryAr).toContain(ar);
    }
  });

  it('no new Latin/transliterated name is invented — no extra text nodes beyond title/ar pairs in the info block', () => {
    const { container } = renderHarness('/ar/courses/ijazah');
    const infoBlocks = container.querySelectorAll('.cl__book-info');
    expect(infoBlocks.length).toBe(4);
    infoBlocks.forEach((block) => {
      // Exactly: primary <strong>, author, stage — no secondary .cl__book-ar in AR mode.
      expect(block.querySelector('.cl__book-ar')).toBeNull();
    });
  });
});

describe('CourseIjazah.jsx source: minimal, scoped diff', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../pages/CourseIjazah.jsx'), 'utf8');

  it('derives the primary title from book.ar/book.title only, not new content', () => {
    expect(src).toMatch(/<strong>\{isAr \? book\.ar : book\.title\}<\/strong>/);
  });

  it('does not touch author/stage/desc/topics/link/linkLabel derivation logic', () => {
    expect(src).toMatch(/const authorLabel = isAr \? book\.author\.ar : book\.author\.en;/);
    expect(src).toMatch(/const stageLabel {2}= isAr \? book\.stage\.ar {2}: book\.stage\.en;/);
    expect(src).toMatch(/const descText {4}= isAr \? book\.desc\.ar {3}: book\.desc\.en;/);
    expect(src).toMatch(/const topics {6}= isAr \? book\.topics\.ar : book\.topics\.en;/);
    expect(src).toMatch(/const linkLabel {3}= isAr \? book\.linkLabel\.ar : book\.linkLabel\.en;/);
  });

  it('BOOKS data is untouched (4 approved titles, no new entries, no invented transliteration)', () => {
    expect(src).toMatch(/title: 'Tuhfat Al-Atfal',\s*\n\s*ar: 'تحفة الأطفال',/);
    expect(src).toMatch(/title: 'Matn Al-Jazariyyah',\s*\n\s*ar: 'متن الجزرية',/);
    expect(src).toMatch(/title: 'Matn Al-Shatibiyyah',\s*\n\s*ar: 'متن الشاطبية',/);
    expect(src).toMatch(/title: "Madinah Mus'haf",\s*\n\s*ar: 'مصحف المدينة النبوية',/);
  });

  it('does not touch course text, SEO, or H1 (useSEO call and hero H1 are unchanged from the module scan)', () => {
    expect(src).toMatch(/useSEO\(\{/);
    expect(src).toMatch(/<h1 className="cl__hero-title">\{isAr \? 'دورة إجازة القرآن الكريم' : 'Quran Ijazah Course'\}<\/h1>/);
  });
});
