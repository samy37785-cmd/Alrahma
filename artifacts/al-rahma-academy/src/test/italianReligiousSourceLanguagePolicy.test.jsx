import { describe, it, expect } from 'vitest';
import { useFullPageEnvironment, mountFullPage, bodyStrings } from './utils/fullPageRender';
import Home from '../pages/Home';
import Adhkar from '../pages/Adhkar';
import { ADHKAR_TR, SOURCE_TR } from '../i18n/adhkarText';
import { ADHKAR } from '../data/adhkarData';
import itLocale from '../i18n/it';
import en from '../i18n/en';
import ar from '../i18n/ar';

// Italian Batch 0 — Religious Source-Language Policy Alignment: no Italian
// translation of a Quran verse, or of a dhikr's meaning/fadl (virtue), is
// created in-project without a licensed source. Both now show their
// literal English source instead, mirroring the same, already-shipped
// correction for French (frenchReligiousSourceLanguagePolicy.test.jsx).
// Dashboard/wisdomQuotes and every other authenticated-only surface are
// explicitly out of this correction's scope and are asserted untouched
// below rather than silently ignored.
// (Imported as `itLocale`, not `it`, to avoid colliding with vitest's own
// global `it()` test function.)

useFullPageEnvironment();

describe('Home hero verse: it.verseQuote/it.verseRef are the literal English source, not an Italian translation', () => {
  it('it.hero.verseQuote / it.hero.verseRef are identical to en.hero.verseQuote / en.hero.verseRef', () => {
    expect(itLocale.hero.verseQuote).toBe(en.hero.verseQuote);
    expect(itLocale.hero.verseRef).toBe(en.hero.verseRef);
  });

  it('regression guard: fails if an Italian translation of the verse is reintroduced', () => {
    // The exact strings that used to be shown before this correction.
    expect(itLocale.hero.verseQuote).not.toBe('"Leggi nel nome del tuo Signore che ha creato."');
    expect(itLocale.hero.verseRef).not.toBe("Sura Al-'Alaq · 96:1");
  });

  it('/it/ renders the English verse text in the hero, not the old Italian translation', async () => {
    await mountFullPage('/it/', Home);
    const verseEl = document.querySelector('.hero__verse');
    expect(verseEl).toBeTruthy();
    expect(verseEl.textContent).toContain(en.hero.verseQuote);
    expect(verseEl.textContent).toContain(en.hero.verseRef);
    expect(verseEl.textContent).not.toContain('Leggi nel nome del tuo Signore che ha creato');
    expect(verseEl.textContent).not.toContain("Sura Al-'Alaq");
  });

  it('EN and AR verse text are unaffected by the Italian correction', () => {
    expect(en.hero.verseQuote).toBe('"Read in the name of your Lord who created."');
    expect(en.hero.verseRef).toBe("Surah Al-'Alaq · 96:1");
    expect(ar.hero.verseQuote).toBe('﴿اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ﴾');
    expect(ar.hero.verseRef).toBe('سورة العلق · 96:1');
  });

  it('non-religious Italian hero content is unaffected (still Italian)', () => {
    expect(itLocale.hero.cta1).toBe('Prenota una prova gratuita');
    expect(itLocale.hero.title).toBe('Regala a tuo figlio il Corano');
    expect(itLocale.hero.certifiedTutors).toBe('Insegnanti certificati');
  });
});

describe('Adhkar: it.meaning/it.fadl are the literal English source, not an Italian translation', () => {
  it('ADHKAR_TR: every one of the 49 entries has it.meaning/it.fadl identical to en.meaning/en.fadl', () => {
    const ids = Object.keys(ADHKAR_TR);
    expect(ids.length).toBe(49);
    for (const id of ids) {
      const entry = ADHKAR_TR[id];
      expect(entry.it.meaning, `${id}.meaning`).toBe(entry.en.meaning);
      expect(entry.it.fadl, `${id}.fadl`).toBe(entry.en.fadl);
    }
  });

  it('regression guard: fails if an Italian translation is reintroduced for the default-shown dhikr', () => {
    // The exact strings that used to be shown for sb1 before this correction.
    expect(ADHKAR_TR.sb1.it.meaning).not.toContain('Siamo entrati nel mattino');
    expect(ADHKAR_TR.sb1.it.fadl).not.toBe('Supplica del mattino per la protezione dal male del giorno.');
  });

  it('/it/tools/adhkar renders the English meaning/fadl text, not the old Italian translation', async () => {
    await mountFullPage('/it/tools/adhkar', Adhkar);
    const body = document.body.textContent;
    // sb1's English meaning (the morning dhikr shown by default) must be
    // present; its old Italian translation must not be.
    expect(body).toContain(ADHKAR_TR.sb1.en.meaning);
    expect(body).not.toContain('Siamo entrati nel mattino e il regno appartiene ad Allah.');
    expect(body).toContain(ADHKAR_TR.sb1.en.fadl);
    expect(body).not.toContain('Supplica del mattino per la protezione dal male del giorno.');
  });

  it('the Arabic dhikr text itself (to be recited) is unaffected -- still Arabic, still unique per item', async () => {
    await mountFullPage('/it/tools/adhkar', Adhkar);
    const arabicEl = document.querySelector('.adhkar__ar');
    expect(arabicEl).toBeTruthy();
    expect(arabicEl.textContent).toBe(ADHKAR.sabah.items[0].ar);
  });

  it('non-religious Adhkar page UI (search placeholder, category names) stays Italian', async () => {
    await mountFullPage('/it/tools/adhkar', Adhkar);
    const input = document.querySelector('input[type="search"], input[placeholder]');
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe('🔍 Cerca adhkar…');
    expect(itLocale.adhkar.categories.sabah).toBe('Adhkar del mattino');
  });

  it('the shared Arabic-narrator transliteration table (book/author source names) is unaffected', () => {
    // Not translated per-language in the first place -- shared, Latin-script
    // transliteration reused as-is by every language including Italian.
    // Untouched by this correction; asserted here so a future change to it
    // is caught by the same test file that governs adjacent religious text.
    expect(SOURCE_TR['البخاري']).toBe('Al-Bukhari');
    expect(SOURCE_TR['مسلم']).toBe('Muslim');
  });
});

describe('Dashboard/wisdomQuotes and other authenticated-only surfaces are out of scope, unchanged', () => {
  it('it.dashboard.wisdomQuotes is untouched by this correction (still its pre-existing Italian text)', () => {
    expect(itLocale.dashboard.wisdomQuotes.learnTeach.gloss).toBe(
      'Il migliore tra voi è colui che impara il Corano e lo insegna.',
    );
    expect(en.dashboard.wisdomQuotes.learnTeach.gloss).toBe(
      'The best among you are those who learn the Quran and teach it.',
    );
  });
});
