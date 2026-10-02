import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import { Progress, Step1, Step2, Step3, Step4, Success } from '../components/features/enrollment/EnrollWizard';
import Enroll from '../pages/Enroll';
import en from '../i18n/en';
import ar from '../i18n/ar';
import fr from '../i18n/fr';
import itl from '../i18n/it';
import { PLAN_TEXT } from '../i18n/content';
import { ENROLL_SEO_TEXT } from '../i18n/enroll/seo';
import { COUNTRIES } from '../i18n/enroll/countries';
import { plans, TEACHERS } from '../data';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Italian Enroll Content Completion audit: every visible string of the whole
// /it/enroll journey (progress bar, steps 1-4, success screen) is Italian,
// except an explicit allowlist of source terms and proper nouns. The audit
// found no remaining English fallback, so this PR is a regression guard only.
// It publishes nothing and changes no form, validation, API or booking logic.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
useFullPageEnvironment();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

const BLANK = {
  name: '', email: '', whatsapp: '', country: '', city: '', times: [], timezone: 'UTC', subjects: [],
  lang: 'en', level: 'beginner', ageGroup: 'adult', genderPref: 'any', teacherId: null, teacherName: '', plan: null,
};
const withPlan = { ...BLANK, name: 'X', email: 'x@y.z', teacherName: 'T', plan: plans[1] };
const noop = () => {};

function Journey() {
  return (
    <main id="main-content">
      <Progress step={1} />
      <Step1 form={BLANK} set={noop} />
      <Step2 form={BLANK} set={noop} />
      <Step3 form={BLANK} set={noop} />
      <Step4 form={withPlan} set={noop} onSubmitBooking={noop} submitting={false} />
      <Success name="X" plan={plans[1]} bookingRef="AR-1" />
    </main>
  );
}

async function visibleStrings(urlPath) {
  await mountFullPage(urlPath, Journey);
  const out = new Set();
  document.querySelectorAll('main *').forEach((e) => {
    if (e.children.length === 0 && (e.textContent || '').trim()) out.add(e.textContent.trim());
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = e.getAttribute(a);
      if (v) out.add(v);
    }
  });
  return [...out];
}

// Strings that are identical in English and Italian by nature: country names
// that are the same word in Italian, instruction-language names (shown in
// their own language), teacher names, plan names, the Tajweed term, "Email"
// and the example e-mail placeholder.
const SOURCE_TERMS = new Set([
  'Austria', 'Canada', 'Australia', 'Qatar', 'Kuwait', 'Tunisia', 'Algeria',
  'English', 'Italiano', 'Français', 'Deutsch', 'Español',
  'Tajweed', 'Email', 'name@example.com',
  'Noorani', 'Huffaz', 'Ijazah',
  ...TEACHERS.map((t) => t.nameEn),
]);

describe('EN/AR/FR and data are unchanged (SHA-256 baselines from origin/main)', () => {
  it('t.enroll, t.pricing, PLAN_TEXT and the Enroll SEO text for en/ar/fr', () => {
    const B = {
      enroll_en: 'ea90e0973acb85fdbc0c940ba05d8c77634b23c75b7f9abb6daa72f7711088fb',
      enroll_ar: '7a981317ef37f5130fad3296af92c0d15215c32dbdf1bf42f817c1397b50534f',
      enroll_fr: '8d12ed33635670abdc0b67751dfc8c87ccc71c5bc64deac20e90415526ec0343',
      pricing_en: 'cc44f50aeac6a50fd3aa46616ead76dfb19884aba55751f86c8e96f798c93cbf',
      pricing_ar: '50e9eb1d15446fff58eb2fa82ff1a5e8792aa463832abd9a04a9d84a5b8bd763',
      pricing_fr: '2d850101e43bd7b934a57be160e2489169574f75c27beb99ebf1d20af1842244',
      plan_en: 'cfa031f96830c100b399d7800fde9908dc93270a0921f8bd6592a9103d2c5ac9',
      plan_ar: 'da3a3f0ccbc1262ebc4ece61561c344ebe250f74cdd749724800138dfca3d9c6',
      plan_fr: '5eb4330752bb34e9a21f1c93368a67e804d8a2809c4f99ddc688e51b2011408e',
      seo_en: '5950dc615fa2f0105cbceba2c07b479c852260e7698a0efde095fd177059127d',
      seo_ar: '495a71619cecc0e83d5b04479eeb28676a8446a45d997439b506a3eff604e548',
      seo_fr: '5c8fb68cef84c943ed7193bfa653b4f4a88ed97504a4921f102a10730b76056d',
    };
    for (const [k, L] of [['en', en], ['ar', ar], ['fr', fr]]) {
      expect(sha(L.enroll), `enroll_${k}`).toBe(B[`enroll_${k}`]);
      expect(sha(L.pricing), `pricing_${k}`).toBe(B[`pricing_${k}`]);
      expect(sha(PLAN_TEXT[k]), `plan_${k}`).toBe(B[`plan_${k}`]);
      expect(sha(ENROLL_SEO_TEXT[k]), `seo_${k}`).toBe(B[`seo_${k}`]);
    }
  });

  it('plan names, prices, sessions, teachers and countries are unchanged', () => {
    expect(sha(plans)).toBe('136b3c32d5d8acba093f2a4ad8fba252209ef94eea0183dd21f181a75d3212ca');
    expect(sha(TEACHERS)).toBe('e354f582f2f4c826562c7810c85bacefbb50c7b499cf77ab2701cc9bc322e9ab');
    expect(sha(COUNTRIES)).toBe('ca512441b1b6cd4da37633da4ec3a149d89bd723976ce0005f77c76598fecbd1');
    expect(plans.map((p) => [p.name, p.price, p.originalPrice, p.sessionsPerWeek, p.sessionsPerMonth])).toEqual([
      ['Noorani', '€56', '€75', 2, 8],
      ['Huffaz', '€84', '€112', 3, 12],
      ['Ijazah', '€112', '€149', 4, 16],
    ]);
  });

  it('the existing Italian SEO title and description are kept as they are', () => {
    expect(sha(ENROLL_SEO_TEXT.it)).toBe('3db985028fa0f2357167465413962811fcd41fcdc45893f70cc645d4d90f7e23');
    expect(ENROLL_SEO_TEXT.it.title).toBe('Prenota lezioni di prova gratuite');
  });
});

describe('the whole /it/enroll journey is Italian', () => {
  it('every string identical to the English journey is an allowed source term', async () => {
    const enStrings = await visibleStrings('/enroll');
    cleanup();
    const itStrings = await visibleStrings('/it/enroll');
    expect(itStrings.length).toBeGreaterThan(150);
    const same = itStrings.filter((s) => enStrings.includes(s) && /[A-Za-z]{3}/.test(s));
    const unexpected = same.filter((s) => !SOURCE_TERMS.has(s));
    expect(unexpected, `English fallback in the Italian journey: ${JSON.stringify(unexpected)}`).toEqual([]);
  });

  it('plan names stay as source terms, with Italian features and tag', async () => {
    const t = await visibleStrings('/it/enroll');
    for (const s of ['Noorani', 'Huffaz', 'Ijazah', 'Più popolare', '3 lezioni a settimana', '12 lezioni al mese', '1 ora per lezione', 'Lezioni individuali', 'Rapporti sui progressi']) {
      expect(t, s).toContain(s);
    }
    for (const s of ['classes / week', 'sessions / month', 'One-to-one tutoring', 'Progress reports', 'Most popular']) {
      expect(t.join('|'), s).not.toContain(s);
    }
    // Numbers and prices stay as they are.
    expect(t.join('|')).toContain('Huffaz — €84/ mese');
  });

  it('teacher cards: Italian titles and rating labels, source names and language tags kept', async () => {
    const t = await visibleStrings('/it/enroll');
    for (const s of ['Sami Mahmoud Abd Al-Aal', 'Specialista in Corano e Tajweed avanzato', '120 valutazioni', 'Donna', '🇮🇹 IT']) {
      expect(t, s).toContain(s);
    }
    expect(t.join('|')).not.toMatch(/Specialist|reviews|Female/);
  });

  it('validation, success and navigation messages all have their own Italian text', () => {
    const E = en.enroll;
    const I = itl.enroll;
    const walk = (a, b, p) => {
      if (typeof a === 'string') {
        if (a === b && /[A-Za-z]{3}/.test(a)) return [p];
        return [];
      }
      return Object.keys(a || {}).flatMap((k) => walk(a[k], b?.[k], `${p}.${k}`));
    };
    // The only identical strings are source terms and an Arabic blessing.
    expect(walk(E, I, 'enroll').sort()).toEqual(['enroll.step2.subjectLabels.1', 'enroll.step4.summaryEmail']);
    expect(I.validation.nameRequired).not.toBe(E.validation.nameRequired);
    expect(I.validation.submitFailed).not.toBe(E.validation.submitFailed);
  });
});

describe('the page itself: empty form, nothing submitted, not published', () => {
  it('renders Italian with every field empty and no network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await mountFullPage('/it/enroll', Enroll);
    expect(document.documentElement.lang).toBe('it');
    expect(document.querySelector('h1').textContent).toBe('Iscriviti ad Al-Rahma Academy');
    for (const el of document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea')) {
      if (el.id !== 'main-content') expect(el.value, el.name || el.placeholder).toBe('');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/enroll has no Italian manifest entry and no Italian sitemap URL', () => {
    expect(PRERENDER_MANIFEST.filter((e) => e.route === '/enroll' && e.locale === 'it')).toHaveLength(0);
    const sitemap = fs.readFileSync(path.resolve(__dirname, '../../public/sitemap.xml'), 'utf8');
    expect(sitemap).not.toContain('/it/enroll');
    expect((sitemap.match(/<loc>/g) || []).length).toBe(129);
  });
});
