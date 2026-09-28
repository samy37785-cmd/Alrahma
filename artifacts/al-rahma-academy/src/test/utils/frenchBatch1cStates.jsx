import { vi } from 'vitest';
import { cleanup, fireEvent, act } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { mountFullPage, headMeta, bodyStrings } from './fullPageRender';
import Teachers from '../../pages/Teachers';
import TeacherProfile from '../../pages/TeacherProfile';
import FAQ from '../../pages/FAQ';
import Enroll from '../../pages/Enroll';
import Privacy from '../../pages/Privacy';
import TermsOfService from '../../pages/TermsOfService';
import RefundPolicy from '../../pages/RefundPolicy';
import ConsentBanner from '../../components/ui/ConsentBanner';
import { TEACHERS, plans } from '../../data';

// French Localization Batch 1C: every template of the batch, and every
// interactive state a visitor can reach on it without anything leaving the
// browser. Shared by the French test and the EN/AR regression test so both
// look at exactly the same states.
//
// Enroll: the booking request is never sent. Callers mock
// '../api/enrollmentApi' (submitEnrollment) before importing this module;
// the success and failure screens are reached through that mock only.

async function click(el) {
  fireEvent.click(el);
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

async function type(el, value) {
  fireEvent.change(el, { target: { value } });
  await act(async () => {});
}

// EnrollWizard's instruction-language buttons, in render order.
const INST_LANG_ORDER = ['en', 'ar', 'it', 'fr', 'de', 'es'];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// Teacher profile needs its :id route param.
function TeacherProfileRoute() {
  return (
    <Routes>
      <Route path="/academy/teachers/:id" element={<TeacherProfile />} />
    </Routes>
  );
}

export function pageMeta() {
  return {
    title: document.title,
    description: headMeta('meta[name="description"]'),
    ogTitle: headMeta('meta[property="og:title"]'),
    ogDescription: headMeta('meta[property="og:description"]'),
    twitterTitle: headMeta('meta[name="twitter:title"]'),
    twitterDescription: headMeta('meta[name="twitter:description"]'),
    htmlLang: document.documentElement.lang,
    htmlDir: document.documentElement.dir,
    jsonLd: $$('script[type="application/ld+json"]').map((s) => s.textContent),
  };
}

// Each driver mounts its page, walks it through its states and calls
// visit(stateName) at each one. The caller reads the DOM inside visit().
async function teachersStates(prefix, visit) {
  await mountFullPage(`${prefix}/academy/teachers`, Teachers);
  await visit('initial');
  for (const btn of $$('.tpg__bio-toggle')) await click(btn);
  await visit('allBiosOpen');
  const groups = () => $$('.tpg__filter-group');
  for (let g = 0; g < 3; g += 1) {
    const count = groups()[g].querySelectorAll('.tpg__filter-btn').length;
    for (let i = 1; i < count; i += 1) {
      await click(groups()[g].querySelectorAll('.tpg__filter-btn')[i]);
      await visit(`filter${g}-${i}`);
    }
    await click(groups()[g].querySelectorAll('.tpg__filter-btn')[0]);
  }
  // The "no match" state: female + the first language no female teacher
  // teaches, found from the rendered filters rather than assumed.
  const lastLang = groups()[2].querySelectorAll('.tpg__filter-btn').length;
  for (let s = 1; s < groups()[0].querySelectorAll('.tpg__filter-btn').length && !$('.tpg__empty'); s += 1) {
    await click(groups()[0].querySelectorAll('.tpg__filter-btn')[s]);
    for (let i = 1; i < lastLang && !$('.tpg__empty'); i += 1) {
      await click(groups()[2].querySelectorAll('.tpg__filter-btn')[i]);
    }
  }
  if (!$('.tpg__empty')) throw new Error('teachers: no empty-filter state reached');
  await visit('noMatch');
  await click($('.tpg__reset'));
  await visit('reset');
}

async function teacherProfileStates(prefix, visit) {
  for (const t of TEACHERS) {
    await mountFullPage(`${prefix}/academy/teachers/${t.id}`, TeacherProfileRoute);
    await visit(`teacher${t.id}`);
    cleanup();
  }
  await mountFullPage(`${prefix}/academy/teachers/9999`, TeacherProfileRoute);
  await visit('notFound');
}

async function faqStates(prefix, visit) {
  await mountFullPage(`${prefix}/resources/faq`, FAQ);
  await visit('initial');
  await click($('.faq-more .btn'));
  await visit('showAll');
  const count = $$('.faq-item__q').length;
  for (let i = 0; i < count; i += 1) {
    await click($$('.faq-item__q')[i]);
    await visit(`open${i}`);
  }
}

async function legalStates(path, Page, prefix, visit, { analytics = false } = {}) {
  await mountFullPage(`${prefix}${path}`, Page);
  await visit('initial');
  if (analytics) {
    // The analytics section renders only while a GA ID is configured.
    // A syntactically valid placeholder, never the real one.
    cleanup();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST000000');
    try {
      await mountFullPage(`${prefix}${path}`, Page);
      await visit('withAnalytics');
    } finally {
      vi.unstubAllEnvs();
    }
  }
}

// Walks the enroll wizard: every validation message, every step, the
// no-match teacher list, a chosen plan with its summary, the failure
// message and the success screen (the last two through the mocked API).
export async function enrollStates(prefix, visit, submitEnrollment) {
  const cont = () => $('.enroll__nav .btn--green');
  await mountFullPage(`${prefix}/enroll`, Enroll);
  await visit('step1');
  await click(cont()); await visit('errName');
  await type($('.enroll__form input'), 'Test Student');
  await click(cont()); await visit('errEmail');
  await type($('#enroll-email'), 'not-an-email');
  await click(cont()); await visit('errEmailInvalid');
  await type($('#enroll-email'), 'student@example.com');
  await click(cont()); await visit('errWhatsapp');
  await type($('#enroll-whatsapp'), 'abc');
  await click(cont()); await visit('errPhone');
  await type($('#enroll-whatsapp'), '+44 7700 900000');
  await type($('#enroll-country'), 'Egypt');
  await type($$('.enroll__form input')[3], 'Cairo');
  for (const b of $$('.enroll__time-btn')) await click(b);
  await visit('step1Filled');
  await click(cont()); await visit('step2');
  await click(cont()); await visit('errSubject');
  for (const b of $$('.enroll__subject-btn')) await click(b);
  await click($$('.enroll__pref-btn')[2]);
  await visit('step2Filled');
  await click(cont()); await visit('step3');
  await click(cont()); await visit('errTeacher');
  // Back to step 2: an instruction language no female teacher teaches gives
  // the "no match" list (chosen from the data, in the wizard's button order).
  await click($('.enroll__nav .btn--ghost'));
  const noFemale = INST_LANG_ORDER.findIndex((l) => !TEACHERS.some((t) => t.gender === 'f' && t.langs.includes(l)));
  if (noFemale < 0) throw new Error('enroll: no "no match" state reachable');
  await click($$('.enroll__lang-btn')[noFemale]);
  await click(cont());
  await visit('step3NoMatch');
  await click($('.enroll__tcard'));
  await visit('step3Selected');
  await click(cont()); await visit('step4');
  for (let i = 0; i < plans.length; i += 1) {
    await click($$('.enroll__plan-card')[i]);
    await visit(`plan${i}`);
  }
  submitEnrollment.mockRejectedValueOnce(new Error('offline'));
  await click($('.enroll__summary .btn--gold'));
  await visit('submitFailed');
  submitEnrollment.mockResolvedValueOnce({ bookingRef: 'BK-TEST-0001' });
  await click($('.enroll__summary .btn--gold'));
  await visit('success');
  cleanup();
  // Arriving from a teacher card / pricing card (query parameters).
  await mountFullPage(`${prefix}/enroll?teacher=${TEACHERS[0].id}&plan=${encodeURIComponent(plans[1].name)}`, Enroll);
  await visit('fromTeacherAndPlan');
}

// The cookie banner is mounted by App.jsx on every page (only while a GA ID
// is configured); here it is shown over the teachers page with a
// placeholder ID, never the real one.
async function cookieBannerStates(prefix, visit) {
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST000000');
  try {
    await mountFullPage(`${prefix}/academy/teachers`, TeachersWithBanner);
    await visit('bannerShown');
  } finally {
    vi.unstubAllEnvs();
  }
}

function TeachersWithBanner() {
  return (
    <>
      <Teachers />
      <ConsentBanner />
    </>
  );
}

export const BATCH_1C = [
  { key: 'teachers', path: '/academy/teachers', run: teachersStates },
  { key: 'teacherProfile', path: '/academy/teachers/:id', run: teacherProfileStates },
  { key: 'faq', path: '/resources/faq', run: faqStates },
  { key: 'enroll', path: '/enroll', run: enrollStates },
  { key: 'privacy', path: '/academy/privacy', run: (p, v) => legalStates('/academy/privacy', Privacy, p, v, { analytics: true }) },
  { key: 'terms', path: '/academy/terms', run: (p, v) => legalStates('/academy/terms', TermsOfService, p, v) },
  { key: 'refund', path: '/academy/refund-policy', run: (p, v) => legalStates('/academy/refund-policy', RefundPolicy, p, v) },
  { key: 'cookieBanner', path: '(shared) cookie banner', run: cookieBannerStates },
];

// Every visible/accessible string and the metadata of every state.
export async function collect(page, prefix, submitEnrollment) {
  const strings = new Set();
  const states = {};
  await page.run(prefix, async (name) => {
    bodyStrings().forEach((s) => strings.add(s));
    for (const o of $$('option')) strings.add(`@option: ${o.textContent.trim()}`);
    states[name] = pageMeta();
  }, submitEnrollment);
  cleanup();
  return { strings, states };
}
