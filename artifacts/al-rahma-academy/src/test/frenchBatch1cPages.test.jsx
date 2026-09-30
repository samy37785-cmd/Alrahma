import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import { BATCH_1C, collect, enrollStates } from './utils/frenchBatch1cStates';
import { submitEnrollment } from '../api/enrollmentApi';
import Teachers from '../pages/Teachers';
import Enroll from '../pages/Enroll';
import FAQ from '../pages/FAQ';
import { TEACHERS } from '../data';
import { COUNTRIES } from '../i18n/enroll/countries';
import { CONSENT_COPY } from '../analytics/consentCopy';
import { ANALYTICS_PRIVACY_COPY } from '../pages/Privacy';
import { ENROLL_SEO_TEXT } from '../i18n/enroll/seo';

// French Localization Batch 1C: /fr/academy/teachers, the 11 teacher
// profiles, /fr/resources/faq, /fr/enroll, /fr/academy/privacy,
// /fr/academy/terms, /fr/academy/refund-policy and the cookie banner render
// French metadata and French visible/accessible text in every state the
// shared driver reaches, translated from the English source only, with the
// tajwid/ijaza glossary. Nothing leaves the browser: the booking request is
// mocked. EN/AR stay byte-identical: see frenchBatch1cEnArRegression.

vi.mock('../api/enrollmentApi', () => ({ submitEnrollment: vi.fn() }));

useFullPageEnvironment();
beforeEach(() => submitEnrollment.mockReset());

// Identical in English and French by nature: the brand, people's names and
// their initials, language codes and autonyms, plan names, contact values,
// operational placeholders, the words "Contact"/"Services"/"Hifz"/"Tafsir"
// that French spells the same, and the values the test itself typed.
const SAME_IN_FRENCH = new Set([
  'AL-RAHMA', 'ACADEMY', 'AL-Rahma', 'Academy.', 'Copyright ©', 'Adhkar', 'FAQ', 'Blog', 'Contact', 'Ctrl K',
  'Facebook', 'Instagram', 'YouTube', 'TikTok', 'Snapchat', 'WhatsApp',
  'alrahmaacademy038@gmail.com', '+20 103 955 3264', 'name@example.com', '+44 7700 900000',
  'EN', 'AR', 'IT', 'ES', 'DE', 'FR', '🇬🇧 EN', '🇮🇹 IT', '🇫🇷 FR', '🇩🇪 DE', '🇪🇸 ES',
  'English', 'Italiano', 'Français', 'Deutsch', 'Español',
  '🏅 Al-Azhar', 'Hifz', 'Tafsir', 'Noorani', 'Huffaz', '1. Services', '13. Contact',
  'Canada', 'France', 'Qatar',
  'Test Student', 'student@example.com', 'Cairo', 'BK-TEST-0001',
]);
const NAMES = new Set(TEACHERS.flatMap((t) => [t.nameEn, t.nameEn.split(' ')[0]]));

function isAllowed(s) {
  const value = s.replace(/^@[a-z-]+: /, '');
  if (SAME_IN_FRENCH.has(value) || NAMES.has(value)) return true;
  // Arabic text (names, the enroll blessing) and strings with no word at all.
  if (/[؀-ۿ]/.test(value) || !/[A-Za-z]{2}/.test(value)) return true;
  // Enroll step 3 card initials ("SM", "KA", ...).
  return /^[A-Z]{1,2}$/.test(value);
}

describe('French Batch 1C pages', () => {
  for (const page of BATCH_1C) {
    it(`${page.path}: French metadata in every state; no English left in text or accessibility labels`, async () => {
      const en = await collect(page, '', submitEnrollment);
      const fr = await collect(page, '/fr', submitEnrollment);
      expect(Object.keys(fr.states)).toEqual(Object.keys(en.states));
      for (const [state, meta] of Object.entries(fr.states)) {
        const where = `${page.key} ${state}`;
        expect(meta.htmlLang, where).toBe('fr');
        expect(meta.htmlDir, where).toBe('ltr');
        // Teacher profile titles are the teacher's name in every language.
        if (!(page.key === 'teacherProfile' && state !== 'notFound')) {
          expect(meta.title, where).not.toBe(en.states[state].title);
        }
        expect(meta.ogTitle, where).toBe(meta.title);
        expect(meta.twitterTitle, where).toBe(meta.title);
        if (en.states[state].description) {
          expect(meta.description, where).not.toBe(en.states[state].description);
          expect(meta.ogDescription, where).toBe(meta.description);
          expect(meta.twitterDescription, where).toBe(meta.description);
        }
      }
      const leaks = [...fr.strings].filter((s) => en.strings.has(s) && !isAllowed(s));
      expect(leaks).toEqual([]);
    }, 60000);

    it(`${page.path}: French glossary — no "Tajweed", "Ijazah", "Seerah" or "Aqeedah" in text or metadata`, async () => {
      const fr = await collect(page, '/fr', submitEnrollment);
      const meta = Object.values(fr.states).flatMap((m) => [m.title, m.description]);
      const found = [...fr.strings, ...meta]
        .filter((s) => /tajweed|ijazah|seerah|aqeedah/i.test(s));
      expect(found).toEqual([]);
    }, 60000);
  }

  it('/fr/academy/teachers: a single, French H1', async () => {
    await mountFullPage('/fr/academy/teachers', Teachers);
    expect([...document.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Nos enseignants qualifiés']);
  });

  it('/fr/enroll: the booking request sent is the same as in English (no value translated)', async () => {
    const payloads = {};
    for (const prefix of ['', '/fr']) {
      submitEnrollment.mockReset();
      await enrollStates(prefix, async () => {}, submitEnrollment);
      cleanup();
      payloads[prefix || 'en'] = submitEnrollment.mock.calls.map(([body]) => body);
    }
    expect(payloads['/fr']).toHaveLength(2);
    expect(payloads['/fr']).toEqual(payloads.en);
    const [body] = payloads['/fr'];
    expect(body.country).toBe('Egypt');
    expect(body.plan).toBe('Ijazah');
    expect(body.subjects).toEqual(['quran', 'tajweed', 'hifz', 'ijazah', 'arabic', 'islamic', 'tafsir', 'seerah']);
  }, 60000);

  it('/fr/enroll: country options keep their English submitted value and show French names', async () => {
    await mountFullPage('/fr/enroll', Enroll);
    const options = [...document.querySelectorAll('#enroll-country option')].slice(1);
    expect(options.map((o) => o.value)).toEqual(COUNTRIES.map((c) => c.value));
    expect(options.find((o) => o.value === 'United Kingdom').textContent).toBe('Royaume-Uni');
  });

  it('teacher and enroll links keep their paths and parameters under /fr', async () => {
    await mountFullPage('/fr/academy/teachers', Teachers);
    const first = TEACHERS[0];
    expect(document.querySelector('.tpg__name-link').getAttribute('href')).toBe(`/fr/academy/teachers/${first.id}`);
    fireEvent.click(document.querySelector('.tpg__enroll-btn'));
    await act(async () => {});
    expect(`${window.location.pathname}${window.location.search}`).toBe(`/fr/enroll?teacher=${first.id}`);
  });

  it('contact links (WhatsApp, e-mail, phone) are the same in French and English', async () => {
    const hrefs = async (prefix) => {
      const out = new Set();
      for (const page of BATCH_1C) {
        await page.run(prefix, async () => {
          for (const a of document.querySelectorAll('a[href^="https://wa.me"], a[href^="mailto:"], a[href^="tel:"]')) {
            // The success screen's pre-filled WhatsApp message is in the
            // page language (unchanged in this batch); compare the target.
            out.add(a.getAttribute('href').split('?')[0]);
          }
        }, submitEnrollment);
        cleanup();
      }
      return [...out].sort();
    };
    expect(await hrefs('/fr')).toEqual(await hrefs(''));
  }, 120000);

  it('/fr/resources/faq: the WhatsApp button keeps its link and is labelled in French', async () => {
    await mountFullPage('/fr/resources/faq', FAQ);
    const wa = document.querySelector('.faq-cta a[href^="https://wa.me/"]');
    expect(wa.textContent).toBe('Écrivez-nous sur WhatsApp');
  });

  it('other languages (es) still render the English enroll title and country names', async () => {
    await mountFullPage('/es/enroll', Enroll);
    expect(document.title).toBe(`${ENROLL_SEO_TEXT.en.title} | AL-Rahma Academy`);
    expect(document.querySelector('#enroll-country option[value="Germany"]').textContent).toBe('Germany');
  });

  // Italian Batch 1B gave /it/enroll its own title and country names (see
  // italianBatch1bPages.test.jsx for full coverage) -- this is a regression
  // guard proving it's no longer the English fallback the test above covers
  // for es.
  it('/it/enroll: renders the Italian enroll title and country names, not the English fallback', async () => {
    await mountFullPage('/it/enroll', Enroll);
    expect(document.title).toBe(`${ENROLL_SEO_TEXT.it.title} | AL-Rahma Academy`);
    expect(document.title).not.toBe(`${ENROLL_SEO_TEXT.en.title} | AL-Rahma Academy`);
    expect(document.querySelector('#enroll-country option[value="Germany"]').textContent).toBe('Germania');
  });
});

describe('Batch 1C French data: complete, same shape as English', () => {
  it('French entries have exactly the English keys', () => {
    expect(Object.keys(CONSENT_COPY.fr)).toEqual(Object.keys(CONSENT_COPY.en));
    expect(Object.keys(ANALYTICS_PRIVACY_COPY.fr)).toEqual(Object.keys(ANALYTICS_PRIVACY_COPY.en));
    expect(Object.keys(ENROLL_SEO_TEXT.fr)).toEqual(Object.keys(ENROLL_SEO_TEXT.en));
    for (const c of COUNTRIES) expect(c.fr, c.value).toBeTruthy();
  });

  it('the analytics text names the French banner buttons it refers to', () => {
    expect(ANALYTICS_PRIVACY_COPY.fr.when).toContain(`« ${CONSENT_COPY.fr.accept} »`);
    expect(ANALYTICS_PRIVACY_COPY.fr.when).toContain(`« ${CONSENT_COPY.fr.reject} »`);
  });
});
