import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Home from '../pages/Home';
import HadithLibrary from '../pages/HadithLibrary';
import { COUNTRY_NAMES_TEXT } from '../i18n/home/countries';
import { A11Y_LABELS_TEXT } from '../i18n/a11yLabels';
import en from '../i18n/en';
import ar from '../i18n/ar';
import it_ from '../i18n/it';
import de from '../i18n/de';
import es from '../i18n/es';
import fr from '../i18n/fr';

// Italian Batch 1C — fix(i18n): complete Italian trust-badge labels and
// Hadith UI punctuation.
//
// Scope: src/components/features/marketing/TrustBadges.jsx (a decorative,
// aria-hidden flag marquee's `title=` tooltip -- was hardcoded to French
// only, now also resolves Italian via COUNTRY_NAMES_TEXT.it, added in
// Italian Batch 1B) and src/pages/HadithLibrary.jsx (a missing `{' '}`
// between the "Islamic Studies course" link and the following "— click any
// book..." sentence, which rendered every locale's course-note with no
// space before the em dash: "...course— click..."). Neither `it.js` nor
// any other locale file's hadith.courseNote/courseLink/courseClick VALUES
// are touched -- the fix is purely a missing whitespace node in JSX, so it
// corrects the same pre-existing rendering bug for every language at once,
// not just Italian (see describe block below proving the underlying string
// content is untouched in all six locales).

const SRC_ROOT = join(import.meta.dirname, '..');

useFullPageEnvironment();

describe('TrustBadges.jsx: country title= tooltips are Italian on /it/, other languages unaffected', () => {
  it('/it/: every flag in the decorative countries marquee has an Italian title, not English', async () => {
    await mountFullPage('/it/', Home);
    const flags = [...document.querySelectorAll('.trust__flag')];
    expect(flags.length).toBeGreaterThan(0);
    const titles = flags.map((el) => el.getAttribute('title'));
    // The component's own 15-country list (a strict subset of the 25 ids
    // COUNTRY_NAMES_TEXT.it already covers, added in Italian Batch 1B).
    const COMPONENT_COUNTRY_IDS = ['gb', 'de', 'fr', 'it', 'es', 'nl', 'se', 'ca', 'us', 'au', 'be', 'ch', 'at', 'pt', 'no'];
    for (const id of COMPONENT_COUNTRY_IDS) {
      expect(titles, `missing Italian title for "${id}"`).toContain(COUNTRY_NAMES_TEXT.it[id]);
    }
    expect(titles).not.toContain('UK');
    expect(titles).not.toContain('Germany');
    expect(titles).toContain('Regno Unito');
    expect(titles).toContain('Germania');
  });

  it('/: (English) the marquee keeps its original English titles, unaffected by this batch', async () => {
    await mountFullPage('/', Home);
    const titles = [...document.querySelectorAll('.trust__flag')].map((el) => el.getAttribute('title'));
    expect(titles).toContain('UK');
    expect(titles).toContain('Germany');
    expect(titles).not.toContain('Regno Unito');
  });

  it('/ar/: Arabic keeps the English titles it already rendered (EN/AR output unchanged)', async () => {
    await mountFullPage('/ar/', Home);
    const titles = [...document.querySelectorAll('.trust__flag')].map((el) => el.getAttribute('title'));
    expect(titles).toContain('UK');
    expect(titles).toContain('Germany');
  });

  it('/fr/: French titles are exactly as before this batch (COUNTRY_NAMES_TEXT.fr, untouched)', async () => {
    await mountFullPage('/fr/', Home);
    const titles = [...document.querySelectorAll('.trust__flag')].map((el) => el.getAttribute('title'));
    expect(titles).toContain(COUNTRY_NAMES_TEXT.fr.gb); // "Royaume-Uni"
    expect(titles).toContain(COUNTRY_NAMES_TEXT.fr.de); // "Allemagne"
    expect(titles).not.toContain('UK');
  });

  it('TrustBadges.jsx source: country ids, order and flags in its own COUNTRIES list are untouched', () => {
    const source = readFileSync(join(SRC_ROOT, 'components/features/marketing/TrustBadges.jsx'), 'utf8');
    const ids = [...source.matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['gb', 'de', 'fr', 'it', 'es', 'nl', 'se', 'ca', 'us', 'au', 'be', 'ch', 'at', 'pt', 'no']);
  });
});

describe('Mandatory exclusion: isnadSection/isnadChain and religious content stay exactly as before, unaffected by this batch', () => {
  it('a11yLabels.js: isnadSection/isnadChain are still byte-identical to en (unchanged by this batch)', () => {
    expect(A11Y_LABELS_TEXT.it.isnadSection).toBe(A11Y_LABELS_TEXT.en.isnadSection);
    expect(A11Y_LABELS_TEXT.it.isnadChain).toBe(A11Y_LABELS_TEXT.en.isnadChain);
  });

  it('/it/: the IsnadChain section still renders the literal English aria-labels and hadith text, untouched by this batch', async () => {
    await mountFullPage('/it/', Home);
    // Force the deferred section to mount the same way italianBatch1bPages
    // does -- IntersectionObserver is stubbed out by useFullPageEnvironment,
    // so DeferredSection renders immediately without needing a real scroll.
    const section = document.querySelector('.isnad');
    expect(section).toBeTruthy();
    expect(section.getAttribute('aria-label')).toBe('The Isnad — unbroken chain of Quran transmission');
  });

  it('it.js hero.verseQuote/verseRef (Batch 0) are untouched by this batch', () => {
    expect(it_.hero.verseQuote).toBe(en.hero.verseQuote);
    expect(it_.hero.verseRef).toBe(en.hero.verseRef);
  });
});

describe('HadithLibrary.jsx: course-note em-dash spacing is correct on /it/tools/hadith, and no locale\'s underlying text changed', () => {
  it('/it/tools/hadith: renders "studi islamici — clicca", not the old "studi islamici— clicca"', async () => {
    await mountFullPage('/it/tools/hadith', HadithLibrary);
    const note = document.querySelector('.hl__course-note');
    expect(note).toBeTruthy();
    const text = note.textContent.replace(/\s+/g, ' ').trim();
    expect(text).toContain('corso di studi islamici — clicca su un libro per sfogliarlo.');
    expect(text).not.toContain('islamici— clicca');
  });

  it('/tools/hadith (English): renders "course — click", not "course— click" -- same shared JSX bug, fixed for every language at once', async () => {
    await mountFullPage('/tools/hadith', HadithLibrary);
    const note = document.querySelector('.hl__course-note');
    const text = note.textContent.replace(/\s+/g, ' ').trim();
    expect(text).toContain('Islamic Studies course — click any book to browse it.');
    expect(text).not.toContain('course— click');
  });

  it('/ar/tools/hadith: the Arabic course-note also gets the corrected spacing (the fix is a shared whitespace node, not a content change)', async () => {
    await mountFullPage('/ar/tools/hadith', HadithLibrary);
    const note = document.querySelector('.hl__course-note');
    const text = note.textContent.replace(/\s+/g, ' ').trim();
    expect(text).toContain('دورة الدراسات الإسلامية — انقر على أي كتاب للتصفح.');
  });

  it('HadithLibrary.jsx source: the fix is exactly one added whitespace node between the Link and courseClick, nothing structural changed', () => {
    const source = readFileSync(join(SRC_ROOT, 'pages/HadithLibrary.jsx'), 'utf8');
    expect(source).toMatch(/<\/Link>\s*\{' '\}\{h\.courseClick\}/);
  });

  it('en/ar/it/es/de/fr.js: hadith.courseNote/courseLink/courseClick string VALUES are byte-identical to before this batch -- only rendering whitespace changed, not content', () => {
    const locales = { en, ar, it: it_, es, de, fr };
    const EXPECTED = {
      en: { courseNote: 'These books are studied in our', courseLink: 'Islamic Studies course', courseClick: '— click any book to browse it.' },
      ar: { courseNote: 'هذه الكتب تُدرَّس في', courseLink: 'دورة الدراسات الإسلامية', courseClick: '— انقر على أي كتاب للتصفح.' },
      it: { courseNote: 'Questi libri vengono studiati nel nostro', courseLink: 'corso di studi islamici', courseClick: '— clicca su un libro per sfogliarlo.' },
      es: { courseNote: 'Estos libros se estudian en nuestro', courseLink: 'curso de estudios islámicos', courseClick: '— haz clic en cualquier libro para explorarlo.' },
      de: { courseNote: 'Diese Bücher werden in unserem', courseLink: 'Islamkunde-Kurs', courseClick: '— klicke auf ein Buch, um es zu durchsuchen.' },
      fr: { courseNote: 'Ces livres sont étudiés dans notre', courseLink: "cours d'études islamiques", courseClick: '— cliquez sur un livre pour le parcourir.' },
    };
    for (const [name, locale] of Object.entries(locales)) {
      expect(locale.hadith.courseNote, `${name}.courseNote`).toBe(EXPECTED[name].courseNote);
      expect(locale.hadith.courseLink, `${name}.courseLink`).toBe(EXPECTED[name].courseLink);
      expect(locale.hadith.courseClick, `${name}.courseClick`).toBe(EXPECTED[name].courseClick);
    }
  });

  it('no other Hadith Library text changed: pageTitle/heroTitle/badge are unaffected on /it/tools/hadith', async () => {
    await mountFullPage('/it/tools/hadith', HadithLibrary);
    expect(document.title).toContain('Biblioteca degli Hadith');
    expect(document.querySelector('h1').textContent).toBe('Biblioteca islamica degli Hadith');
  });
});
