import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import CourseIslamicStudies from '../pages/CourseIslamicStudies';
import { BOOKS } from '../data/islamicStudiesData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same Header/Footer provider mocks as the other Language Closure phases —
// neither is touched by this fix.
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ isAdmin: false }) }));

// Language Closure Phase 4 (policy approved by محمود): the 9 Islamic Studies
// book cards on /courses/islamic-studies always showed book.title (English)
// as the primary bold title, with book.ar (Arabic) only as a secondary rtl
// line -- on every language, including Arabic. IslamicStudiesBookCard.jsx
// now shows book.ar as the primary title when lang === 'ar'. BOOKS itself
// (title/ar/author/module/desc/topics/link/libraryNote) is untouched --
// these Arabic titles already existed in islamicStudiesData.js and are
// pre-approved by محمود; no data/order/authors/modules/descriptions/topics
// were changed.

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <CourseIslamicStudies />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

function primaryTitles(container) {
  return Array.from(container.querySelectorAll('.cl__book strong')).map((el) => el.textContent);
}

describe('Islamic Studies books: Arabic page shows the Arabic title as primary', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('BOOKS has exactly the 9 pre-approved titles (sanity check on the fixture this test relies on)', () => {
    expect(BOOKS.length).toBe(9);
    const expected = [
      ['Islamic Creed Series', 'العقيدة في ضوء الكتاب والسنة'],
      ['Al-Fiqh Al-Muyassar', 'الفقه الميسر في ضوء الكتاب والسنة'],
      ['Bulugh Al-Maram', 'بلوغ المرام من أدلة الأحكام'],
      ['The Sealed Nectar (Ar-Raheeq Al-Makhtum)', 'الرحيق المختوم'],
      ["Ash-Shama'il Al-Muhammadiyah", 'الشمائل المحمدية'],
      ["Al-Arba'een Al-Nawawiyyah", 'الأربعون النووية'],
      ['Riyad As-Salihin', 'رياض الصالحين'],
      ['Al-Adab Al-Mufrad', 'الأدب المفرد'],
      ['Al-Tafsir Al-Muyassar', 'التفسير الميسر'],
    ];
    expect(BOOKS.map((b) => [b.title, b.ar])).toEqual(expected);
  });

  it('Arabic (/ar/courses/islamic-studies): every one of the 9 books shows its Arabic title as the primary title', () => {
    const { container } = renderHarness('/ar/courses/islamic-studies');
    const titles = primaryTitles(container);
    expect(titles.length).toBe(9);
    for (const book of BOOKS) {
      expect(titles).toContain(book.ar);
    }
  });

  it('Arabic (/ar/courses/islamic-studies): none of the 9 English titles appear as a primary title', () => {
    const { container } = renderHarness('/ar/courses/islamic-studies');
    const titles = primaryTitles(container);
    for (const book of BOOKS) {
      expect(titles).not.toContain(book.title);
    }
  });

  it('English (/courses/islamic-studies): unchanged — English title primary, Arabic shown as secondary line', () => {
    const { container } = renderHarness('/courses/islamic-studies');
    const titles = primaryTitles(container);
    expect(titles.length).toBe(9);
    for (const book of BOOKS) {
      expect(titles).toContain(book.title);
    }
    const secondaryAr = Array.from(container.querySelectorAll('.cl__book .cl__book-ar')).map((el) => el.textContent);
    expect(secondaryAr.length).toBe(9);
    for (const book of BOOKS) {
      expect(secondaryAr).toContain(book.ar);
    }
  });
});

describe('IslamicStudiesBookCard.jsx source: minimal, scoped diff', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/features/courses/IslamicStudiesBookCard.jsx'), 'utf8');

  it('derives the primary title from book.ar/book.title only, not new content', () => {
    expect(src).toMatch(/<strong>\{isAr \? book\.ar : book\.title\}<\/strong>/);
  });

  it('does not touch author/module/desc/topics/link/libraryNote logic', () => {
    expect(src).toMatch(/book\.author\.ar : book\.author\.en/);
    expect(src).toMatch(/book\.module\.ar : book\.module\.en/);
    expect(src).toMatch(/book\.desc\.ar : book\.desc\.en/);
    expect(src).toMatch(/book\.topics\.ar : book\.topics\.en/);
    expect(src).toMatch(/book\.linkLabel\.ar : book\.linkLabel\.en/);
    expect(src).toMatch(/book\.libraryNote\.ar : book\.libraryNote\.en/);
  });

  it('does not import from islamicStudiesData.js (book data is untouched)', () => {
    expect(src).not.toMatch(/islamicStudiesData/);
  });
});
