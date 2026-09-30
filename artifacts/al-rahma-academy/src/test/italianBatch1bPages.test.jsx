import { describe, it, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage, headMeta } from './utils/fullPageRender';
import Home from '../pages/Home';
import Enroll from '../pages/Enroll';
import { ENROLL_SEO_TEXT, pickEnrollSeo } from '../i18n/enroll/seo';
import { COUNTRY_NAMES_TEXT } from '../i18n/home/countries';
import { COUNTRIES, countryLabel } from '../i18n/enroll/countries';
import { A11Y_LABELS_TEXT, pickA11yLabels } from '../i18n/a11yLabels';
import { TRUST_BAR_COUNTRIES } from '../data/home/countries';

// Italian Batch 1B — fix(i18n): complete Italian enrollment metadata,
// country names and non-religious accessibility labels.
//
// Scope: src/i18n/enroll/seo.js (title/description/OG for /it/enroll),
// src/i18n/home/countries.js (TrustBar's scrolling country ticker) and
// src/i18n/enroll/countries.js (the Enroll Step1 country <select> -- a
// separate file/list from home/countries.js; both had to gain `it` for the
// same visitor to see Italian country names in both places, per this
// batch's own instructions to verify "/it/enroll and the flags carousel"),
// plus src/i18n/a11yLabels.js's ordinary (non-religious) labels.
//
// Mandatory exclusion carried over unchanged: a11yLabels.js's
// isnadSection/isnadChain stay the literal English source, exactly like
// Italian Batch 0's hero.verseQuote/verseRef and adhkarText.js meaning/fadl
// -- asserted explicitly below, not just left alone by omission.

useFullPageEnvironment();

describe('Enroll SEO (src/i18n/enroll/seo.js): Italian title/description/OG on /it/enroll', () => {
  it('/it/enroll: renders Italian title and meta description, not the English fallback', async () => {
    await mountFullPage('/it/enroll', Enroll);
    expect(document.title).toBe(`${ENROLL_SEO_TEXT.it.title} | AL-Rahma Academy`);
    expect(headMeta('meta[name="description"]')).toBe(ENROLL_SEO_TEXT.it.description);
    expect(document.title).not.toContain(ENROLL_SEO_TEXT.en.title);
    expect(headMeta('meta[name="description"]')).not.toBe(ENROLL_SEO_TEXT.en.description);
  });

  it('the Italian copy states a free trial + booking request + WhatsApp confirmation - no instant payment, subscription, or dashboard claim', () => {
    const { description } = ENROLL_SEO_TEXT.it;
    expect(description).toMatch(/gratuit/i);
    expect(description).toMatch(/WhatsApp/);
    expect(description).not.toMatch(/abbonamento/i);
    expect(description).not.toMatch(/pannello/i);
  });

  it('Italian has exactly the same keys as English (title, description, keywords) -- nothing missing, nothing extra', () => {
    expect(Object.keys(ENROLL_SEO_TEXT.it).sort()).toEqual(Object.keys(ENROLL_SEO_TEXT.en).sort());
  });

  it('pickEnrollSeo("it") resolves to the real Italian object, not the English fallback', () => {
    expect(pickEnrollSeo('it')).toBe(ENROLL_SEO_TEXT.it);
    expect(pickEnrollSeo('it')).not.toBe(ENROLL_SEO_TEXT.en);
  });

  it('EN/AR/FR are unaffected by this batch', () => {
    expect(ENROLL_SEO_TEXT.en.title).toBe('Book Free Trial Lessons');
    expect(ENROLL_SEO_TEXT.ar.title).toBe('احجز حصة تجريبية مجانية');
    expect(ENROLL_SEO_TEXT.fr.title).toBe("Réserver des cours d'essai gratuits");
  });
});

describe('Trust-bar country names (src/i18n/home/countries.js): Italian ticker on Home', () => {
  it('COUNTRY_NAMES_TEXT.it covers every trust-bar country id, same set as en', () => {
    for (const c of TRUST_BAR_COUNTRIES) {
      expect(typeof COUNTRY_NAMES_TEXT.it[c.id], `missing it name for country "${c.id}"`).toBe('string');
      expect(COUNTRY_NAMES_TEXT.it[c.id].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(COUNTRY_NAMES_TEXT.it).sort()).toEqual(Object.keys(COUNTRY_NAMES_TEXT.en).sort());
  });

  it('no value is left identical to the English one (a real translation happened, not a copy) -- except the handful of country names legitimately identical in en/it', () => {
    // Canada, Australia, Austria, Uzbekistan, Indonesia: the same word in
    // both languages -- not a missed translation.
    const SAME_WORD_IN_BOTH = new Set(['ca', 'au', 'at', 'uz', 'idn']);
    for (const id of Object.keys(COUNTRY_NAMES_TEXT.en)) {
      if (SAME_WORD_IN_BOTH.has(id)) { expect(COUNTRY_NAMES_TEXT.it[id]).toBe(COUNTRY_NAMES_TEXT.en[id]); continue; }
      expect(COUNTRY_NAMES_TEXT.it[id], id).not.toBe(COUNTRY_NAMES_TEXT.en[id]);
    }
  });

  it('/it/: the TrustBar scrolling ticker renders Italian country names, not English', async () => {
    await mountFullPage('/it/', Home);
    const names = [...document.querySelectorAll('.trust-bar__flag-name')].map((el) => el.textContent);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain(COUNTRY_NAMES_TEXT.it.de); // "Germania"
    expect(names).not.toContain('Germany');
    expect(names).toContain(COUNTRY_NAMES_TEXT.it.gb); // "Regno Unito"
    expect(names).not.toContain('UK');
  });

  it('EN/AR/FR are unaffected by this batch', () => {
    expect(COUNTRY_NAMES_TEXT.en.de).toBe('Germany');
    expect(COUNTRY_NAMES_TEXT.ar.de).toBe('ألمانيا');
    expect(COUNTRY_NAMES_TEXT.fr.de).toBe('Allemagne');
  });
});

describe('Enroll-form country names (src/i18n/enroll/countries.js): Italian <select> on /it/enroll', () => {
  it('has the exact same 27 values, in the exact same order, as before -- the booking payload contract is untouched', () => {
    const ORIGINAL_COUNTRY_VALUES = [
      'United Kingdom', 'Italy', 'France', 'Germany', 'Spain', 'Netherlands',
      'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Denmark', 'Norway',
      'United States', 'Canada', 'Australia', 'New Zealand',
      'Egypt', 'Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Jordan', 'Morocco',
      'Tunisia', 'Algeria', 'Turkey', 'Other',
    ];
    expect(COUNTRIES.map((c) => c.value)).toEqual(ORIGINAL_COUNTRY_VALUES);
  });

  it('every country has a real Italian label (countryLabel resolves it, not the English fallback)', () => {
    for (const c of COUNTRIES) {
      expect(typeof c.it, `missing it label for "${c.value}"`).toBe('string');
      expect(c.it.trim().length).toBeGreaterThan(0);
      expect(countryLabel(c.value, 'it')).toBe(c.it);
    }
    expect(countryLabel('Egypt', 'it')).toBe('Egitto');
    expect(countryLabel('United Kingdom', 'it')).toBe('Regno Unito');
  });

  it('/it/enroll: the country <select> shows Italian option text, and the submitted value stays the original English string', async () => {
    await mountFullPage('/it/enroll', Enroll);
    const select = document.querySelector('#enroll-country');
    const egypt = [...select.options].find((o) => o.value === 'Egypt');
    expect(egypt.textContent).toBe('Egitto');
    expect(egypt.value).toBe('Egypt');
    expect([...select.options].some((o) => o.textContent === 'Egypt')).toBe(false);
  });

  it('a legacy language with no real translation (es) still falls back to the English name, never an invented one', () => {
    expect(countryLabel('Egypt', 'es')).toBe('Egypt');
    expect(countryLabel('Egypt', 'de')).toBe('Egypt');
  });

  it('EN/AR/FR are unaffected by this batch', () => {
    expect(countryLabel('Egypt', 'en')).toBe('Egypt');
    expect(countryLabel('Egypt', 'ar')).toBe('مصر');
    expect(countryLabel('Egypt', 'fr')).toBe('Égypte');
  });
});

describe('Accessibility labels (src/i18n/a11yLabels.js): ordinary Italian labels on Home', () => {
  const ORDINARY_KEYS = [
    'heroLiveBadge', 'heroScrollCue', 'lessonDemo', 'closeVideo',
    'tutorVideo', 'tutorVideoTitle', 'reviewCount', 'carouselPrev', 'carouselNext',
    'trustBar', 'trustSignals', 'countriesRepresented', 'quizSection', 'quizProgress',
    'currencySelector', 'footerTrust',
    'audioRegion', 'audioPlay', 'audioMute', 'audioPlayTitle', 'audioMuteTitle', 'audioDismiss',
  ];

  it('it has exactly the same keys as en (including the two religious keys, kept literal-English -- see below)', () => {
    expect(Object.keys(A11Y_LABELS_TEXT.it).sort()).toEqual(Object.keys(A11Y_LABELS_TEXT.en).sort());
  });

  it('every ordinary key is real Italian text, not identical to the English value', () => {
    for (const key of ORDINARY_KEYS) {
      const en = A11Y_LABELS_TEXT.en[key];
      const it = A11Y_LABELS_TEXT.it[key];
      if (typeof en === 'function') {
        expect(it('Sami', 3, 5)).not.toBe(en('Sami', 3, 5));
      } else {
        expect(it, key).not.toBe(en);
        expect(typeof it, key).toBe('string');
        expect(it.trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it('pickA11yLabels("it") resolves to the real Italian object, not the English fallback', () => {
    expect(pickA11yLabels('it')).toBe(A11Y_LABELS_TEXT.it);
    expect(pickA11yLabels('it')).not.toBe(A11Y_LABELS_TEXT.en);
  });

  it('/it/: Hero, LevelQuiz, QuranAudioPlayer and TrustBar aria-labels are Italian', async () => {
    await mountFullPage('/it/', Home);
    expect(document.querySelector('.hero__scroll-cue').getAttribute('aria-label')).toBe(A11Y_LABELS_TEXT.it.heroScrollCue);
    expect(document.querySelector('.lq').getAttribute('aria-label')).toBe(A11Y_LABELS_TEXT.it.quizSection);
    expect(document.querySelector('.qap').getAttribute('aria-label')).toBe(A11Y_LABELS_TEXT.it.audioRegion);
    expect(document.querySelector('.trust-bar').getAttribute('aria-label')).toBe(A11Y_LABELS_TEXT.it.trustBar);
  });

  describe('Mandatory exclusion: isnadSection/isnadChain stay the literal English source, not a translation', () => {
    it('it.isnadSection / it.isnadChain are byte-identical to en (same source-language policy as Italian Batch 0)', () => {
      expect(A11Y_LABELS_TEXT.it.isnadSection).toBe(A11Y_LABELS_TEXT.en.isnadSection);
      expect(A11Y_LABELS_TEXT.it.isnadChain).toBe(A11Y_LABELS_TEXT.en.isnadChain);
      expect(A11Y_LABELS_TEXT.it.isnadSection).toBe('The Isnad — unbroken chain of Quran transmission');
      expect(A11Y_LABELS_TEXT.it.isnadChain).toBe('Chain of Quran transmission');
    });

    it('/it/: the IsnadChain section aria-labels render the English text, not a new Italian translation', async () => {
      await mountFullPage('/it/', Home);
      const section = document.querySelector('.isnad');
      expect(section.getAttribute('aria-label')).toBe('The Isnad — unbroken chain of Quran transmission');
      const chain = section.querySelector('.isnad__chain');
      expect(chain.getAttribute('aria-label')).toBe('Chain of Quran transmission');
    });
  });

  it('EN/AR/FR are unaffected by this batch', () => {
    expect(A11Y_LABELS_TEXT.en.trustBar).toBe('Trusted worldwide');
    expect(pickA11yLabels('ar')).toBe(A11Y_LABELS_TEXT.en);
    expect(A11Y_LABELS_TEXT.fr.trustBar).toBe('Reconnue dans le monde entier');
    expect(pickA11yLabels('fr')).toBe(A11Y_LABELS_TEXT.fr);
  });
});

describe('No console/render regression: /it/ and /it/enroll mount cleanly together', () => {
  it('mounting Home then Enroll in Italian does not throw and both resolve real Italian text', async () => {
    await mountFullPage('/it/', Home);
    expect(document.querySelector('.trust-bar')).toBeTruthy();
    cleanup();
    await mountFullPage('/it/enroll', Enroll);
    expect(document.title).toContain(ENROLL_SEO_TEXT.it.title);
  });
});
