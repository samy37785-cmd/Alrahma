import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import en from '../i18n/en';
import ar from '../i18n/ar';
import itLocale from '../i18n/it';
import es from '../i18n/es';
import de from '../i18n/de';
import fr from '../i18n/fr';
import { siteFacts, trialLessonPhrase, limitedTrialSpotsText } from '../data/siteFacts';
import { site } from '../data/site';
import { plans, planComparison } from '../data/home';
import { TEACHER_CREDENTIALS } from '../data/marketing/teachers';
import ReferralCard from '../components/ui/ReferralCard';
import Pricing from '../components/features/marketing/Pricing';

// Authoritative Content Truth Contract — Full-Site Corrective Round 3
// (2026-09-02). Covers what this round changed or added: freeTrialLessons
// actually wired (not a dead value), full six-language translation of the
// teacher-profile credentials/proof block and the "lessons taught" line,
// ReferralCard rebuilt without unproven reward promises, the 2× plan
// comparison derived from `plans`, the honest limited-trial-spots figure,
// and the support-response-vs-tutor-assignment SLA separation. Prefers
// real component rendering/behavior over static grep wherever practical.

vi.mock('../components/layout/Header', () => ({ default: () => <div /> }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'abcdef123456' } }) }));

const { default: Teachers } = await import('../pages/Teachers');
const { default: TeacherProfile } = await import('../pages/TeacherProfile');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCALES = { en, ar, it: itLocale, es, de, fr };
const LOCALE_PATH = { en: '/', ar: '/ar', it: '/it', es: '/es', de: '/de', fr: '/fr' };
const NON_EN = ['ar', 'it', 'es', 'de', 'fr'];

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

// TeacherProfile.jsx reads :id via useParams(), which needs a real route
// match — a bare BrowserRouter at "/" won't populate it. Use MemoryRouter
// with the localized path pattern directly instead.
function renderTeacherProfile(localePrefix, teacherId) {
  const url = localePrefix ? `${localePrefix}/academy/teachers/${teacherId}` : `/academy/teachers/${teacherId}`;
  const routePath = localePrefix ? `${localePrefix}/academy/teachers/:id` : '/academy/teachers/:id';
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LangProvider>
        <Routes>
          <Route path={routePath} element={<TeacherProfile />} />
        </Routes>
      </LangProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  siteFacts.freeTrialLessons = 1; // restore after any test that mutates it
  siteFacts.limitedTrialSpots = 6;
  cleanup();
});

describe('freeTrialLessons is a real, wired value with correct grammar (Round 4, Part 6)', () => {
  // trialLessonPhrase() replaced trialLessonWord(): the old function
  // returned a bare number word that callers spliced into a fixed-singular
  // template, which produced ungrammatical Arabic at count=2 (a duplicated
  // noun: "حصة تجريبية حصتان مجانية"). The new function returns the whole
  // agreement-correct phrase, so these assertions check that the NOUN and
  // "free" ADJECTIVE inflect together with the count — not just that the
  // numeral substring changed (a test that only checked the numeral would
  // pass even if the surrounding words stayed wrongly singular).
  it('returns a non-empty phrase for every language at count 1', () => {
    for (const lang of Object.keys(LOCALES)) {
      expect(typeof trialLessonPhrase(lang, 1)).toBe('string');
      expect(trialLessonPhrase(lang, 1).length).toBeGreaterThan(0);
    }
  });

  it('count=1 uses singular noun forms', () => {
    expect(trialLessonPhrase('en', 1)).toBe('one free trial lesson');
    expect(trialLessonPhrase('ar', 1)).toBe('حصة تجريبية مجانية واحدة');
    expect(trialLessonPhrase('it', 1)).toBe('una lezione di prova gratuita');
    expect(trialLessonPhrase('es', 1)).toBe('una clase de prueba gratuita');
    expect(trialLessonPhrase('de', 1)).toBe('eine kostenlose Probestunde');
    expect(trialLessonPhrase('fr', 1)).toBe("un cours d'essai gratuit");
  });

  it('count=2 inflects the noun AND the "free" adjective together — not just the numeral', () => {
    // English: noun pluralizes ("lesson" -> "lessons").
    expect(trialLessonPhrase('en', 2)).toBe('two free trial lessons');
    expect(trialLessonPhrase('en', 2)).toMatch(/lessons\b/);
    // Arabic: dual noun ("حصتان") AND dual adjective ("تجريبيتان"/"مجانيتان")
    // both change — proves the whole phrase is atomic, not a single spliced
    // word inside a fixed-singular template (the Round 3 bug this fixes).
    expect(trialLessonPhrase('ar', 2)).toBe('حصتان تجريبيتان مجانيتان');
    expect(trialLessonPhrase('ar', 2)).not.toMatch(/حصة تجريبية/);
    // Italian/Spanish/French: noun AND "gratuit(a/e)/gratuit(o/s)" adjective
    // both pluralize.
    expect(trialLessonPhrase('it', 2)).toBe('due lezioni di prova gratuite');
    expect(trialLessonPhrase('es', 2)).toBe('dos clases de prueba gratuitas');
    expect(trialLessonPhrase('fr', 2)).toBe("deux cours d'essai gratuits");
    // German: noun pluralizes ("Probestunde" -> "Probestunden").
    expect(trialLessonPhrase('de', 2)).toBe('zwei kostenlose Probestunden');
  });

  it('reading siteFacts.freeTrialLessons as the default count is not a dead value', () => {
    expect(trialLessonPhrase('en')).toBe('one free trial lesson');
    siteFacts.freeTrialLessons = 2;
    expect(trialLessonPhrase('en')).toBe('two free trial lessons');
    siteFacts.freeTrialLessons = 1;
  });

  it('falls back to a grammatical plural phrase for an uncovered count rather than throwing', () => {
    expect(trialLessonPhrase('en', 9)).toBe('9 free trial lessons');
    expect(trialLessonPhrase('ar', 9)).toBe('9 حصة تجريبية مجانية');
  });

  it('src/data/home.js and src/data/faqItems.js import trialLessonPhrase rather than hardcoding "one"', () => {
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../data/home.js'), 'utf8');
    const faqSrc = fs.readFileSync(path.resolve(__dirname, '../data/faqItems.js'), 'utf8');
    expect(homeSrc).toMatch(/trialLessonPhrase/);
    expect(faqSrc).toMatch(/trialLessonPhrase/);
  });
});

describe('Teachers.jsx listing shows Sami\'s lessons-taught line, translated (Part 4)', () => {
  it.each(Object.keys(LOCALES))('renders "2,500" with a translated (non-English-literal) suffix in %s', (lang) => {
    const { container } = renderWithLang(<Teachers />, LOCALE_PATH[lang]);
    expect(container.textContent).toContain('2,500');
    if (lang !== 'en') {
      expect(container.textContent).not.toContain('2,500 lessons taught');
    }
  });

  it('the "10 sample records" comment no longer describes the dataset (it now has 11)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/Teachers.jsx'), 'utf8');
    expect(src).not.toMatch(/10 sample records/);
  });
});

describe('TeacherProfile.jsx credentials/proof block is fully translated (Part 4)', () => {
  it('Sami\'s profile shows "2,500+" lessons on the profile page itself, not only the listing card', () => {
    renderTeacherProfile('', 1);
    expect(screen.getByText('2,500+')).toBeInTheDocument();
  });

  it.each(NON_EN)('no hardcoded English proof-block literal leaks into %s', (lang) => {
    const prefix = lang === 'en' ? '' : `/${lang}`;
    const { container } = renderTeacherProfile(prefix, 1);
    for (const literal of [
      'Held by every Al-Rahma Academy tutor',
      'Verified Credentials',
      'Cairo, Egypt — verified graduate',
      'Ijazah Certificate',
      'Continuous sanad to the Prophet',
      'Identity Verified',
      'Government ID verified',
      'Credentials on File',
      'Diplomas, Ijazah and ID documents',
      'Copies of all certificates',
    ]) {
      expect(container.textContent, `${lang} leaked "${literal}"`).not.toContain(literal);
    }
  });

  it('the shared TEACHER_CREDENTIALS list has real translations for all six languages, not an en/ar-only object', () => {
    for (const cred of TEACHER_CREDENTIALS) {
      for (const lang of Object.keys(LOCALES)) {
        expect(cred.label[lang], `credential "${cred.label.en}" missing ${lang}`).toBeTruthy();
      }
    }
    // Every non-English language's four labels must be distinct from
    // English's — a stronger check than "truthy" — catches an accidental
    // EN copy-paste into another language's slot.
    for (const lang of NON_EN) {
      const enLabels = TEACHER_CREDENTIALS.map((c) => c.label.en);
      const langLabels = TEACHER_CREDENTIALS.map((c) => c.label[lang]);
      expect(langLabels, `${lang} credential labels identical to English`).not.toEqual(enLabels);
    }
  });
});

describe('ReferralCard — no unproven reward promises, full i18n (Part 10)', () => {
  it('renders translated title/sub/copy/share text with no leftover reward-program copy', () => {
    for (const lang of Object.keys(LOCALES)) {
      const { container, unmount } = renderWithLang(<ReferralCard />, LOCALE_PATH[lang]);
      const text = container.textContent;
      expect(text, `${lang}: unproven reward text`).not.toMatch(/get 1 month free/i);
      expect(text, `${lang}: unproven reward text`).not.toMatch(/one free month/i);
      expect(text, `${lang}: unproven reward text`).not.toMatch(/no limit on referrals/i);
      expect(text).toContain(LOCALES[lang].referral.title);
      unmount();
    }
  });

  it('renders right-to-left for Arabic', () => {
    renderWithLang(<ReferralCard />, '/ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it('the WhatsApp share message mentions the real one-trial-lesson offer, not a reward, for every language', () => {
    const originalOpen = window.open;
    window.open = vi.fn();
    try {
      for (const lang of Object.keys(LOCALES)) {
        const { getByRole, unmount } = renderWithLang(<ReferralCard />, LOCALE_PATH[lang]);
        fireEvent.click(getByRole('button', { name: LOCALES[lang].referral.waAria }));
        expect(window.open).toHaveBeenCalled();
        const [url] = window.open.mock.calls.at(-1);
        const text = decodeURIComponent(url.split('text=')[1].split('&')[0]);
        expect(text, `${lang} WhatsApp text`).toContain(referralLinkContains(text));
        expect(text, `${lang} WhatsApp text`).not.toMatch(/month free/i);
        window.open.mockClear();
        unmount();
      }
    } finally {
      window.open = originalOpen;
    }
  });

  it('copy-to-clipboard still works and shows the translated "copied" confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithLang(<ReferralCard />, '/');
    fireEvent.click(screen.getByRole('button', { name: en.referral.copyAria }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByText(en.referral.copied)).toBeInTheDocument();
  });
});

// Helper: every language's WhatsApp message ends with the referral link
// itself, so any language's text containing "alrahmaacademy.com/enroll"
// proves the link was appended correctly.
function referralLinkContains() {
  return 'alrahmaacademy.com/enroll';
}

describe('2× weekly-lesson-time comparison, derived from `plans` (Part 8)', () => {
  it('planComparison() derives the multiplier from real sessionsPerWeek values, not separate literals', () => {
    const cmp = planComparison();
    expect(cmp.base.name).toBe('Noorani');
    expect(cmp.top.name).toBe('Ijazah');
    expect(cmp.multiplier).toBe(cmp.top.sessionsPerWeek / cmp.base.sessionsPerWeek);
    expect(cmp.multiplier).toBe(2);
  });

  it('never claims a results/outcome speedup ("faster", "memorise faster") anywhere in src', () => {
    const marketingDir = path.resolve(__dirname, '../components/features/marketing');
    const files = fs.readdirSync(marketingDir).filter((f) => f.endsWith('.jsx'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(marketingDir, f), 'utf8');
      expect(src, f).not.toMatch(/2×?\s*faster|twice as fast|learn faster|memoris?e faster/i);
    }
  });

  it('Pricing.jsx renders the comparisonNote text in every language, mentioning the real session counts', () => {
    for (const lang of Object.keys(LOCALES)) {
      const { container, unmount } = renderWithLang(<Pricing />, LOCALE_PATH[lang]);
      expect(container.textContent, lang).toContain(String(plans[plans.length - 1].sessionsPerWeek));
      unmount();
    }
  });
});

describe('Limited trial spots — honest, centrally-sourced, no fake scarcity (Part 9)', () => {
  it('limitedTrialSpotsText(lang) returns a string mentioning 6 for every language when limitedTrialSpots=6', () => {
    for (const lang of Object.keys(LOCALES)) {
      const text = limitedTrialSpotsText(lang);
      expect(text, lang).toBeTruthy();
      expect(text, lang).toMatch(/6/);
    }
  });

  it('returns null (render nothing) when limitedTrialSpots is 0 or null, for every language', () => {
    siteFacts.limitedTrialSpots = 0;
    for (const lang of Object.keys(LOCALES)) expect(limitedTrialSpotsText(lang)).toBeNull();
    siteFacts.limitedTrialSpots = null;
    for (const lang of Object.keys(LOCALES)) expect(limitedTrialSpotsText(lang)).toBeNull();
  });

  it('siteFacts carries a manual confirmation date, not a day/week seed', () => {
    expect(siteFacts.limitedTrialSpotsConfirmed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('no countdown/deadline/seeded-scarcity pattern exists as live code anywhere in the marketing surface', () => {
    // Historical comments documenting what was already removed (e.g. "this
    // file used to compute getNextSundayDeadline/useCountdown...") are
    // expected and fine; only live code re-introducing these is a failure.
    const marketingDir = path.resolve(__dirname, '../components/features/marketing');
    const files = fs.readdirSync(marketingDir).filter((f) => f.endsWith('.jsx'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(marketingDir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/getNextSundayDeadline|useCountdown\(|spotsToday\(|spotsLeft\(/);
    }
  });
});

describe('Support response vs. trial confirmation vs. tutor assignment are not conflated (Part 7)', () => {
  it('Dashboard.jsx no longer promises tutor assignment on a support-response timer', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/Dashboard.jsx'), 'utf8');
    expect(src).not.toMatch(/Assigned within.*\{siteFacts\.supportResponseHours\}/);
    expect(src).not.toMatch(/import \{ siteFacts \} from '\.\.\/data\/siteFacts'/);
  });

  it('faqItems.js\'s trial-booking answer no longer promises tutor matching AND session confirmation on the support-response timer, in any language', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../data/faqItems.js'), 'utf8');
    expect(src).not.toMatch(/match you with a tutor and confirm your session within/i);
    expect(src).not.toMatch(/سنطابقك مع معلم ونؤكد جلستك خلال/);
  });
});

describe('Plan-name inventory — display copy updated, internal API defaults deliberately deferred (Part 11)', () => {
  it('billing.js sample invoices (display-only fallback) use the live plan names', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../data/billing.js'), 'utf8');
    expect(src).not.toMatch(/plan:\s*'Starter'/);
    expect(src).not.toMatch(/plan:\s*'Standard'/);
    expect(src).toMatch(/plan:\s*'Noorani'/);
    expect(src).toMatch(/plan:\s*'Huffaz'/);
  });

  it('the cancellation-survey retention offer references a real plan name (Noorani), not "Starter", in all six languages', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../i18n/experience.js'), 'utf8');
    expect(src).not.toMatch(/Starter/);
  });

  it('RefundPolicy.jsx\'s covered-plans list names the real plans, not Starter/Standard/Premium', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/RefundPolicy.jsx'), 'utf8');
    expect(src).not.toMatch(/Starter/);
    expect(src).not.toMatch(/\(Standard, Premium\)|Standard, Premium\)/);
  });

  it('AdminUsersTab.jsx\'s internal API default plan key is deliberately left untouched (deferred blocker, not silently changed)', () => {
    // This IS still 'Starter' — a real, documented, intentional exception:
    // it is an admin-API call parameter, not display copy, and this task
    // cannot prove what plan-key string the backend actually expects
    // without touching lib/db or the payment backend, both out of scope.
    const src = fs.readFileSync(path.resolve(__dirname, '../components/features/admin/AdminUsersTab.jsx'), 'utf8');
    expect(src).toMatch(/handleSubscription\([^)]*'Starter'\)/);
  });
});

describe('llms.txt and index.html stay in sync with siteFacts (static files, Part 6)', () => {
  it('llms.txt mentions the real trial-lesson minutes and never "two free trial classes"', () => {
    const txt = fs.readFileSync(path.join(REPO_ROOT, 'public', 'llms.txt'), 'utf8');
    expect(txt).toContain(`${siteFacts.trialLessonMinutes}-minute`);
    expect(txt).not.toMatch(/two free trial classes/i);
  });

  it('index.html\'s Organization JSON-LD foundingDate matches siteFacts and telephone matches site.js (Round 4: the single phone source)', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(html).toContain(`"foundingDate": "${siteFacts.foundingYear}"`);
    const normalizedHtmlPhone = html.match(/"telephone":\s*"([^"]+)"/)[1].replace(/\s/g, '');
    expect(normalizedHtmlPhone).toBe(site.phoneE164);
  });

  it('About.jsx\'s founder signature imports siteFacts.founder rather than a hardcoded literal', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/features/marketing/About.jsx'), 'utf8');
    expect(src).toMatch(/\{siteFacts\.founder\}/);
  });
});

describe('siteFacts property audit — no dead/misleading properties (Part 6)', () => {
  it('standardWeeklyHours/premiumWeeklyHours were removed (they named a non-existent Standard/Premium plan structure)', () => {
    expect(siteFacts).not.toHaveProperty('standardWeeklyHours');
    expect(siteFacts).not.toHaveProperty('premiumWeeklyHours');
  });

  it('every remaining property has at least one real consumer, per the audit documented in siteFacts.js', () => {
    const consumerFiles = [
      '../data/about.js', '../pages/Home.jsx', '../components/features/marketing/About.jsx',
      '../pages/Teachers.jsx', '../data/home.js', '../data/faqItems.js',
      '../components/ui/ReferralCard.jsx', '../components/features/marketing/Trial.jsx',
    ];
    const combined = consumerFiles
      .map((f) => fs.readFileSync(path.resolve(__dirname, f), 'utf8'))
      .join('\n');
    for (const prop of [
      'totalLessons', 'totalStudents', 'totalFamilies', 'totalTeachers',
      'featuredTeacherCount', 'countriesServed', 'academyRating', 'trialLessonMinutes',
    ]) {
      expect(combined, `siteFacts.${prop}`).toMatch(new RegExp(`siteFacts\\.${prop}\\b`));
    }
  });

  // Round 4 fix: an independent audit found supportResponseHours had zero
  // real production consumers — every locale file hardcoded "24" in
  // footer.replyBadge/trustBadges instead of importing the constant. Wired
  // both to siteFacts.supportResponseHours (Footer.jsx renders both), so
  // this now has genuine, checkable consumers — never used for tutor
  // assignment/trial confirmation/payment-verification timing, and the
  // legal text in TermsOfService.jsx is untouched (out of scope).
  it('supportResponseHours is wired into footer.replyBadge/trustBadges in every locale, not a dead value', () => {
    for (const locale of [en, ar, itLocale, es, de, fr]) {
      expect(locale.footer.replyBadge).toMatch(new RegExp(String(siteFacts.supportResponseHours)));
      expect(locale.footer.trustBadges.some((b) => b.includes(String(siteFacts.supportResponseHours)))).toBe(true);
    }
  });

  it('supportResponseHours is not used for trial-confirmation or tutor-assignment timing', () => {
    const trialSrc = fs.readFileSync(path.resolve(__dirname, '../components/features/marketing/Trial.jsx'), 'utf8');
    expect(trialSrc).not.toMatch(/supportResponseHours/);
  });
});
