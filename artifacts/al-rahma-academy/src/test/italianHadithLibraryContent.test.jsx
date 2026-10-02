import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import HadithLibrary from '../pages/HadithLibrary';
import { HADITH_COLLECTIONS_TEXT } from '../i18n/hadith/collections';
import { HADITH_COLLECTIONS } from '../data/hadith/collections';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian Hadith Library Content Wave: the ten collection cards on
// /it/tools/hadith show Italian author and note text. Scholar and book
// names, Arabic, the honorific, the "(d. N AH)" marker and grading terms stay
// in source form. Nothing is published: no manifest/sitemap change.

useFullPageEnvironment();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.navigator.webdriver;
});

const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const IT = HADITH_COLLECTIONS_TEXT.it;
const EN = HADITH_COLLECTIONS_TEXT.en;
const IDS = HADITH_COLLECTIONS.map((c) => c.id);

describe('EN/AR/FR are unchanged', () => {
  it('HADITH_COLLECTIONS_TEXT en/ar/fr and the structural HADITH_COLLECTIONS hash to their origin/main baseline', () => {
    expect(sha(HADITH_COLLECTIONS_TEXT.en)).toBe('38a937b028131707603fb4d5736084222509963d251c17c24bc9629082ad46a1');
    expect(sha(HADITH_COLLECTIONS_TEXT.ar)).toBe('323ae8c51b92e3a415352aa05ef3504ca1aeed571754d3d15f71d3d597ff6e6b');
    expect(sha(HADITH_COLLECTIONS_TEXT.fr)).toBe('97b76f7638ecb40e3e962ae7c5cc2df9e22771e13075a7860637cf8735a65caf');
    expect(sha(HADITH_COLLECTIONS)).toBe('8f4efd41d1c470b384d69e649077c8c5ff04ac679d52dfb79d967a7a496f13c2');
  });
});

describe('Italian author and note for all ten collections', () => {
  it('has exactly the ten collection ids, each with an author and a note', () => {
    expect(IDS).toHaveLength(10);
    expect(Object.keys(IT).sort()).toEqual([...IDS, 'dir'].sort());
    for (const id of IDS) {
      expect(IT[id].author, id).toBeTruthy();
      expect(IT[id].note, id).toBeTruthy();
    }
  });

  it('every note is translated (differs from English) with no English leaks', () => {
    const leaks = [/\bThe\b/, /\bmost\b/, /\bhadiths\b/, /\bcollection\b/, /\bknown\b/i, /\bearliest\b/, /\bbooks\b/, /\bSelected\b/, /\bNotable\b/, /\bDivine\b/];
    for (const id of IDS) {
      expect(IT[id].note, id).not.toBe(EN[id].note);
      for (const re of leaks) expect(IT[id].note, `${id} ${re}`).not.toMatch(re);
    }
  });

  it('author lines keep names, titles and the "(d. N AH)" marker exactly as in English', () => {
    for (const id of IDS) {
      if (id === 'qudsi') continue;
      expect(IT[id].author, id).toBe(EN[id].author);
      expect(IT[id].author, id).toMatch(/\(d\. \d+ AH\)$/);
    }
  });

  it('the Qudsi author translates only the descriptive part and keeps the honorific', () => {
    expect(IT.qudsi.author).toBe('Vari (parole di Allah riferite dal Profeta ﷺ)');
    expect(IT.qudsi.note).toBe('Discorso divino riferito dal Profeta ﷺ — le parole di Allah al di fuori del Corano');
    expect(IT.qudsi.author).toContain('ﷺ');
    expect(IT.qudsi.note).toContain('ﷺ');
  });

  it('source terms survive in the notes: Sahih/Hasan/Da\'eef, Kutub Al-Sittah, Fiqh, Quran-related names', () => {
    expect(IT.tirmidhi.note).toContain("(Sahih/Hasan/Da'eef)");
    expect(IT.nasai.note).toContain("'Kutub Al-Sittah'");
    expect(IT.abudawud.note).toContain('Fiqh');
    expect(IT.ibnmajah.note).toContain('Fiqh');
  });

  it('numbers in the notes match the card counts, in Italian grouping', () => {
    expect(IT.bukhari.note).toContain('7.589 hadith, 97 libri');
    expect(IT.abudawud.note).toContain('5.274 hadith');
    expect(IT.nawawi.note).toContain('42 hadith');
    expect(HADITH_COLLECTIONS.find((c) => c.id === 'bukhari').count).toBe(7589);
    expect(HADITH_COLLECTIONS.find((c) => c.id === 'abudawud').count).toBe(5274);
  });
});

describe('/it/tools/hadith renders the Italian cards, with no fetch before a click', () => {
  it('all ten cards show the Italian author and note, the source titles and Arabic, and no card text is English', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window.navigator, 'webdriver', { value: true, configurable: true, writable: true });
    await mountFullPage('/it/tools/hadith', HadithLibrary);
    expect(document.documentElement.lang).toBe('it');
    const cards = [...document.querySelectorAll('.hl__card')];
    expect(cards).toHaveLength(10);
    HADITH_COLLECTIONS.forEach((col, i) => {
      const c = cards[i];
      expect(c.querySelector('.hl__card-author').textContent, col.id).toBe(IT[col.id].author);
      expect(c.querySelector('.hl__card-note').textContent, col.id).toBe(IT[col.id].note);
      expect(c.querySelector('.hl__card-title').textContent, col.id).toBe(col.label);
      expect(c.querySelector('.hl__card-ar').textContent, col.id).toBe(col.ar);
    });
    // Nothing was fetched, and the raw render carries no hadith or CDN data.
    expect(fetchMock).not.toHaveBeenCalled();
    const main = document.querySelector('#main-content').textContent;
    expect(main).not.toMatch(/Narrated|narrated by/i);
    expect(document.querySelector('.hl__hadith, .hl__list, .hl__loading')).toBeNull();
  });

  it('a real visitor render also makes no fetch until a card is clicked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await mountFullPage('/it/tools/hadith', HadithLibrary);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the page metadata is unchanged by this content wave', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await mountFullPage('/it/tools/hadith', HadithLibrary);
    expect(document.title).toBe('Biblioteca degli Hadith | AL-Rahma Academy');
    expect(headMeta('meta[name="description"]')).toContain('10 raccolte');
  });
});

describe('publication state: published in wave 3 (see italianNextWavePublication.test.jsx)', () => {
  it('/tools/hadith has its Italian manifest entry (wave 3)', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/tools/hadith' && e.locale === 'it')).toHaveLength(1);
  });
});
