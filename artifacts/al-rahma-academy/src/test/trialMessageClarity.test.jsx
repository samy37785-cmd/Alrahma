import { describe, it, expect } from 'vitest';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import { Step4 } from '../components/features/enrollment/EnrollWizard';
import TajweedCheckerPage from '../pages/tools/TajweedCheckerPage';
import { TAJWEED_CHECKER_TEXT } from '../i18n/tools/tajweedChecker';
import { plans } from '../data';
import en from '../i18n/en';
import ar from '../i18n/ar';
import fr from '../i18n/fr';
import itl from '../i18n/it';
import es from '../i18n/es';
import de from '../i18n/de';

// Owner request (2026-10-28): make it plain that lessons are online on Zoom,
// that the Enroll page sends a booking request and takes no payment, and give
// the Tajweed checker the same trial strip as the Verse of the Day page.

useFullPageEnvironment();

const DICTS = { en, ar, fr, it: itl, es, de };
const prefix = (lang) => (lang === 'en' ? '' : `/${lang}`);
const form = {
  name: 'X', email: 'x@y.z', whatsapp: '', country: '', city: '', times: [], timezone: 'UTC', subjects: [],
  lang: 'en', level: 'beginner', ageGroup: 'adult', genderPref: 'any', teacherId: null, teacherName: '', plan: null,
};
const noop = () => {};

describe('the hero says the trial lesson is online on Zoom', () => {
  it.each(Object.keys(DICTS))('%s', (lang) => {
    expect(DICTS[lang].hero.badge1).toContain('Zoom');
  });
});

describe('Enroll step 4 says it is a booking request, not a payment', () => {
  it('every language has its own translation', () => {
    const texts = Object.values(DICTS).map((d) => d.enroll.step4.noPayment);
    for (const text of texts) expect(typeof text === 'string' && text.length > 40).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it.each(Object.keys(DICTS))('%s: the note sits above the plans, before any plan is picked', async (lang) => {
    await mountFullPage(`${prefix(lang)}/enroll`, () => (
      <Step4 form={form} set={noop} onSubmitBooking={noop} submitting={false} />
    ));
    const note = document.querySelector('.enroll__step-note');
    expect(note?.textContent).toBe(DICTS[lang].enroll.step4.noPayment);
    const grid = document.querySelector('.enroll__plan-grid');
    expect(note.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll('.enroll__plan-card')).toHaveLength(plans.length);
  });
});

describe('the Tajweed checker has a trial strip', () => {
  it.each([['en', 'en'], ['ar', 'ar'], ['fr', 'fr'], ['it', 'it'], ['es', 'en'], ['de', 'en']])(
    '%s links to that language\'s Enroll page with the %s text',
    async (lang, textLang) => {
      await mountFullPage(`${prefix(lang)}/tools/tajweed-checker`, TajweedCheckerPage);
      const cta = TAJWEED_CHECKER_TEXT[textLang].trialCta;
      const strip = document.querySelector('main .votd-enroll-cta');
      expect(strip).not.toBeNull();
      expect(strip.querySelector('.votd-enroll-cta__text').textContent).toBe(cta.text);
      expect(strip.querySelector('.votd-enroll-cta__note').textContent).toBe(cta.note);
      const link = strip.querySelector('a');
      expect(link.textContent).toBe(cta.button);
      expect(link.getAttribute('href')).toBe(`${prefix(lang)}/enroll`);
    },
  );
});
