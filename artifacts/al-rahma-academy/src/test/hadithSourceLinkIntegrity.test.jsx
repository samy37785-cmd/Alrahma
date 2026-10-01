import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import CourseIslamicStudies from '../pages/CourseIslamicStudies';
import { HADITHS } from '../data/islamicStudiesData';

// P1 Hadith Source-Link Correction: the Al-Tabarani hadith ("The best of
// people are those who are most beneficial to people") is from
// Al-Mu'jam Al-Awsat, not Nawawi's Forty, so its sunnah.com/nawawi40 link was
// removed. No replacement link was added. Everything else is unchanged.

useFullPageEnvironment();

function setWebdriver(value) {
  Object.defineProperty(window.navigator, 'webdriver', { value, configurable: true });
}
afterEach(() => {
  setWebdriver(undefined);
  vi.useRealTimers();
  cleanup();
});

const TABARANI = HADITHS.find((h) => h.source.en === "Al-Mu'jam Al-Awsat — Al-Tabarani");
const TABARANI_INDEX = HADITHS.indexOf(TABARANI);

// The 16 other hadiths and their links, exactly as before this change.
const OTHER_URLS = [1, 2, 3, 4, 6, 7, 10, 11, 12, 13, 16, 18, 19, 23, 34, 40].map(
  (n) => `https://sunnah.com/nawawi40:${n}`,
);

describe('Al-Tabarani hadith: no link, content untouched', () => {
  it('exists once, is the last of 17, and has no url', () => {
    expect(HADITHS).toHaveLength(17);
    expect(TABARANI).toBeDefined();
    expect(TABARANI_INDEX).toBe(16);
    expect(HADITHS.filter((h) => h.source.en.includes('Tabarani'))).toHaveLength(1);
    expect(TABARANI.url).toBeUndefined();
    expect('url' in TABARANI).toBe(false);
    expect(JSON.stringify(TABARANI)).not.toMatch(/sunnah\.com|nawawi40/);
  });

  it('Arabic, English/French/Italian text, narrator and source are byte-identical to before', () => {
    const en = 'The best of people are those who are most beneficial to people.';
    expect(TABARANI.arabic).toBe('خَيْرُ النَّاسِ أَنْفَعُهُمْ لِلنَّاسِ');
    expect(TABARANI.ar).toBe('خير الناس أنفعهم للناس.');
    expect(TABARANI.en).toBe(en);
    expect(TABARANI.fr).toBe(en);
    expect(TABARANI.it).toBe(en);
    expect(TABARANI.narrator).toEqual({
      en: 'Jabir ibn Abdullah (RA)',
      ar: 'جابر بن عبد الله (رضي الله عنه)',
      fr: 'Jabir ibn Abdullah (RA)',
      it: 'Jabir ibn Abdullah (RA)',
    });
    expect(TABARANI.source).toEqual({
      en: "Al-Mu'jam Al-Awsat — Al-Tabarani",
      ar: 'المعجم الأوسط — الطبراني',
      fr: "Al-Mu'jam Al-Awsat — Al-Tabarani",
      it: "Al-Mu'jam Al-Awsat — Al-Tabarani",
    });
    expect(Object.keys(TABARANI).sort()).toEqual(['ar', 'arabic', 'en', 'fr', 'it', 'narrator', 'source']);
  });

  it('the other 16 hadiths keep their exact links', () => {
    expect(HADITHS.slice(0, 16).map((h) => h.url)).toEqual(OTHER_URLS);
  });
});

describe('the card hides the Sunnah.com link for this hadith in EN/AR/FR/IT, and shows it for the others', () => {
  // dayOfYear of 16 Jan is 16, and 16 % 17 selects the last hadith.
  async function cardOn(lang, isoDate) {
    setWebdriver(undefined);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(isoDate));
    await mountFullPage(`${lang === 'en' ? '' : `/${lang}`}/courses/islamic-studies`, CourseIslamicStudies);
    return {
      arabic: document.querySelector('.cl__hadith-arabic')?.textContent ?? null,
      link: document.querySelector('.cl__hadith-link'),
    };
  }

  for (const lang of ['en', 'ar', 'fr', 'it']) {
    it(`${lang}: Tabarani day shows the hadith with no link`, async () => {
      const { arabic, link } = await cardOn(lang, '2026-01-16T12:00:00Z');
      expect(arabic).toBe(TABARANI.arabic);
      expect(link).toBeNull();
    });

    it(`${lang}: another day still shows its own sunnah.com link`, async () => {
      const { arabic, link } = await cardOn(lang, '2026-01-01T12:00:00Z');
      const h = HADITHS.find((x) => x.arabic === arabic);
      expect(h).toBeDefined();
      expect(h).not.toBe(TABARANI);
      expect(link?.getAttribute('href')).toBe(h.url);
    });
  }
});
