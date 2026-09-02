import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { siteFacts } from '../data/siteFacts';
import { TEACHERS, TEACHER_CREDENTIALS } from '../data/marketing/teachers';
import { plans } from '../data/home';
import faqItems from '../data/faqItems';
import en from '../i18n/en';
import ar from '../i18n/ar';
import itLocale from '../i18n/it';
import es from '../i18n/es';
import de from '../i18n/de';
import fr from '../i18n/fr';

// Authoritative Content Truth Contract — Corrective Closure Round 2
// (2026-09-02). These tests guard the specific gaps this round closed —
// see docs/trust-marketing-remediation.md's "Update 2026-09-02" section
// and the round's own final report for the full context. They are
// deliberately data/behavior assertions, not static grep-only checks,
// wherever the underlying data structure makes that possible.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCALES = { en, ar, it: itLocale, es, de, fr };

function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('siteFacts — owner-confirmed values (Part 1)', () => {
  it('holds the exact owner-confirmed academy facts', () => {
    expect(siteFacts.totalLessons).toBe('15,000+');
    expect(siteFacts.totalStudents).toBe('1,500+');
    expect(siteFacts.totalFamilies).toBe('1,200+');
    expect(siteFacts.totalTeachers).toBe(30);
    expect(siteFacts.featuredTeacherCount).toBe(11);
    expect(siteFacts.countriesServed).toBe(10);
    expect(siteFacts.academyRating).toBe(4.9);
    expect(siteFacts.academyRatingOutOf).toBe(5);
    expect(siteFacts.supportResponseHours).toBe(24);
    expect(siteFacts.freeTrialLessons).toBe(1);
    expect(siteFacts.trialLessonMinutes).toBe(60);
    expect(siteFacts.refundWindowDays).toBe(24);
    expect(siteFacts.founder).toBe('Mahmoud Samy');
    expect(siteFacts.foundingYear).toBe('2020');
    expect(siteFacts.phoneDisplay).toBe('+20 101 605 4663');
  });

  it('no longer carries standardWeeklyHours/premiumWeeklyHours (Round 3)', () => {
    // Content Truth Contract Round 3 removed these: they modeled a
    // non-existent "Standard/Premium" 2-tier plan structure that conflicts
    // with the real Noorani/Huffaz/Ijazah 3-tier plans, and had zero real
    // consumers. The 2x weekly-lesson-time comparison is now derived live
    // from `plans` via planComparison() — see the dedicated describe block
    // below.
    expect(siteFacts).not.toHaveProperty('standardWeeklyHours');
    expect(siteFacts).not.toHaveProperty('premiumWeeklyHours');
  });

  it('never carries a ratingCount/reviewCount for the academy itself', () => {
    expect(siteFacts).not.toHaveProperty('ratingCount');
    expect(siteFacts).not.toHaveProperty('reviewCount');
  });
});

describe('TEACHERS — eleven-profile verified roster (Part 2)', () => {
  it('has exactly 11 featured profiles, matching siteFacts.featuredTeacherCount', () => {
    expect(TEACHERS.length).toBe(11);
    expect(TEACHERS.length).toBe(siteFacts.featuredTeacherCount);
  });

  it('siteFacts.totalTeachers (30) is the real team size, distinct from the 11 displayed profiles', () => {
    expect(siteFacts.totalTeachers).toBe(30);
    expect(siteFacts.totalTeachers).not.toBe(TEACHERS.length);
  });

  it('every teacher id is unique', () => {
    const ids = TEACHERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the exact owner-provided review matrix matches every teacher, by Arabic name', () => {
    const expected = {
      'سامي محمود عبد العال': 120,
      'عبد الله أيمن': 109,
      'إسلام محمد': 80,
      'خيرية المحمدي': 95,
      'جودة الشوبكي': 90,
      'محمد عبد المقصود': 105,
      'محمود سامي': 100,
      'آية': 79,
      'أمنية عبد الله': 85,
      'علاء رجب': 70,
      'فاطمة الراشدي': 75,
    };
    expect(Object.keys(expected).length).toBe(11);
    for (const [nameAr, reviews] of Object.entries(expected)) {
      const teacher = TEACHERS.find((t) => t.nameAr === nameAr);
      expect(teacher, `teacher "${nameAr}" not found in TEACHERS`).toBeTruthy();
      expect(teacher.reviews, `reviews for "${nameAr}"`).toBe(reviews);
    }
  });

  it('the sum of all 11 review counts is 1008 — a test invariant only, never displayed as an academy-wide rating/review count', () => {
    const sum = TEACHERS.reduce((acc, t) => acc + (t.reviews || 0), 0);
    expect(sum).toBe(1008);
    // Guard against 1008 leaking into siteFacts or any JSON-LD/schema field.
    expect(JSON.stringify(siteFacts)).not.toMatch(/\b1008\b/);
  });

  it('no teacher carries an individual `rating` field', () => {
    for (const t of TEACHERS) {
      expect(t, `teacher id=${t.id}`).not.toHaveProperty('rating');
    }
  });

  it('only Sami (id=1) has a `lessons` field, and it is exactly "2,500"', () => {
    const withLessons = TEACHERS.filter((t) => 'lessons' in t);
    expect(withLessons.map((t) => t.id)).toEqual([1]);
    expect(withLessons[0].lessons).toBe('2,500');
  });

  it('the ambiguous "2,400" lessons figure is not assigned to any teacher', () => {
    for (const t of TEACHERS) {
      expect(String(t.lessons ?? ''), `teacher id=${t.id}`).not.toMatch(/2,?400/);
    }
  });

  describe('Gouda El-Shoubaky profile (new eleventh teacher)', () => {
    const gouda = TEACHERS.find((t) => t.nameAr === 'جودة الشوبكي');

    it('exists with the expected identity and confirmed facts only', () => {
      expect(gouda).toBeTruthy();
      expect(gouda.nameEn).toBe('Gouda El-Shoubaky');
      expect(gouda.gender).toBe('m');
      expect(gouda.reviews).toBe(90);
      expect(gouda.langs.slice().sort()).toEqual(['en', 'fr']);
    });

    it('has no lessons field and no rating field', () => {
      expect(gouda).not.toHaveProperty('lessons');
      expect(gouda).not.toHaveProperty('rating');
    });

    it('has title/bio/specialties present for all six languages, like every other profile', () => {
      for (const lang of ['en', 'ar', 'it', 'es', 'de', 'fr']) {
        expect(gouda.title[lang], `title.${lang}`).toBeTruthy();
        expect(gouda.bio[lang], `bio.${lang}`).toBeTruthy();
        expect(gouda.specialties[lang], `specialties.${lang}`).toBeTruthy();
      }
    });

    it('does not invent years of experience, student counts, results, or outcomes', () => {
      const allText = [
        ...Object.values(gouda.bio),
        ...Object.values(gouda.specialties).flat(),
      ].join(' ');
      // No "N years", no student/result counts, no "helped N students" style claims.
      expect(allText).not.toMatch(/\d+\s*(years?|ans|anni|años|Jahre)/i);
      expect(allText).not.toMatch(/\d+\+?\s*(students?|élèves|studenti|estudiantes|Schüler|طلاب)/i);
      expect(allText).not.toMatch(/\d+\s*(lessons?|hours?)/i);
    });
  });

  it('Omnia Abd Allah (id=4) has reviews = 85', () => {
    const omnia = TEACHERS.find((t) => t.id === 4);
    expect(omnia.nameAr).toBe('أمنية عبد الله');
    expect(omnia.reviews).toBe(85);
  });
});

describe('TEACHER_CREDENTIALS — shared, not individual (Part 3)', () => {
  it('does not overclaim expertise beyond confirmed "experience"', () => {
    const jurisprudence = TEACHER_CREDENTIALS.find((c) => /jurisprudence|فقه/i.test(c.label.en + c.label.ar));
    expect(jurisprudence.label.en).not.toMatch(/expert/i);
  });
});

describe('no Background Check / Child Safety Cleared / accreditation-partnership claims (Part 3)', () => {
  const FORBIDDEN_PATTERNS = [
    /background[- ]check(ed|s)?\s*(completed)?/i,
    /child safety cleared/i,
    /safe (for|to teach) (children|minors)/i,
    /academy is (accredited|certified) by al-azhar/i,
    /officially partnered with al-azhar/i,
    /al-azhar accreditation of (the|this) academy/i,
  ];

  function walk(dir, exts, exclude) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (exclude.some((x) => entry.name === x)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full, exts, exclude));
      else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
    }
    return out;
  }

  const srcDir = path.resolve(__dirname, '..');
  const files = walk(srcDir, ['.js', '.jsx'], ['test']).filter(
    (f) => !f.includes(`${path.sep}test${path.sep}`),
  );

  it.each(files)('%s does not contain a forbidden background-check/accreditation claim', (file) => {
    const src = stripJsComments(fs.readFileSync(file, 'utf8'));
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(src, `${path.basename(file)} matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it('TeacherProfile.jsx keeps the allowed identity/credentials-on-file claims', () => {
    // Content Truth Contract Round 3 moved this block's text from hardcoded
    // English literals into tp.identityVerifiedTitle/tp.credentialsOnFileTitle
    // (translated into all six languages) — assert the JSX still renders
    // those keys, and that the keys themselves resolve to the expected
    // English copy in en.js, rather than grepping for the old literals.
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/TeacherProfile.jsx'), 'utf8');
    expect(src).toMatch(/tp\.identityVerifiedTitle/);
    expect(src).toMatch(/tp\.credentialsOnFileTitle/);
    expect(en.tp.identityVerifiedTitle).toBe('Identity Verified');
    expect(en.tp.credentialsOnFileTitle).toBe('Credentials on File');
  });
});

describe('"30 teachers, 11 featured, others exist" wording (Part 7)', () => {
  it('every locale has a non-empty teachersPg.rosterNote mentioning both counts', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      const note = dict.teachersPg.rosterNote;
      expect(note, `${code} rosterNote`).toBeTruthy();
      expect(note, `${code} rosterNote should mention 30`).toMatch(/30/);
      expect(note, `${code} rosterNote should mention 11`).toMatch(/11/);
    }
  });

  it('rosterNote values match siteFacts, not a hardcoded/stale number', () => {
    for (const [code, dict] of Object.entries(LOCALES)) {
      expect(dict.teachersPg.rosterNote, code).toContain(String(siteFacts.totalTeachers));
      expect(dict.teachersPg.rosterNote, code).toContain(String(siteFacts.featuredTeacherCount));
    }
  });
});

describe('all six locales remain structurally valid after this round (Part 9 item 17)', () => {
  it('every locale has the same teachersPg key set as en', () => {
    const expected = Object.keys(en.teachersPg).sort();
    for (const [code, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(dict.teachersPg).sort(), code).toEqual(expected);
    }
  });
});

describe('free-trial wording is consistent everywhere: one lesson, 60 minutes (Part 4)', () => {
  const FORBIDDEN = [
    /\b2\s+(completely\s+)?free trial (classes|lessons)\b/i,
    /\btwo (complimentary|completely free|free)?\s*trial (classes|lessons)\b/i,
    /\b2\s*FREE trial lessons?\b/i,
    /٢\s*حصت(ين|ان)\s*تجريبيت/,
    /\b2\s+lezioni di prova\b/i,
    /\b2\s+clases de prueba\b/i,
    /\b2\s+völlig kostenlose Probestunden\b/i,
    /\b2\s+cours d.essai\b/i,
  ];

  it('FAQ trial item (index 0) uses one 60-minute free lesson in all six languages', () => {
    const item = faqItems[0];
    for (const lang of ['en', 'ar', 'it', 'es', 'de', 'fr']) {
      const answer = item[lang].a;
      for (const pattern of FORBIDDEN) {
        expect(answer, `${lang}: ${pattern}`).not.toMatch(pattern);
      }
      expect(answer, `${lang} should mention 60`).toMatch(/60/);
    }
  });

  it('ReferralCard.jsx WhatsApp share text offers one free trial lesson, not two', () => {
    // Content Truth Contract Round 3 rewrote ReferralCard.jsx to build its
    // WhatsApp text from t.referral.waMessage instead of a hardcoded literal
    // in the component itself — assert the component no longer hardcodes the
    // old "2 FREE" claim, and that the real i18n message (en.js) it now reads
    // from resolves to the correct one-lesson, siteFacts-derived wording.
    const src = fs.readFileSync(path.resolve(__dirname, '../components/ui/ReferralCard.jsx'), 'utf8');
    expect(src).not.toMatch(/2\s*FREE trial lessons?/i);
    expect(en.referral.waMessage).not.toMatch(/2\s*FREE/i);
    expect(en.referral.waMessage).toMatch(new RegExp(`${siteFacts.trialLessonMinutes}-minute`));
  });

  it('public/llms.txt offers one free trial lesson, not two', () => {
    const txt = fs.readFileSync(path.join(REPO_ROOT, 'public', 'llms.txt'), 'utf8');
    expect(txt).not.toMatch(/two free trial classes/i);
    expect(txt).not.toMatch(/book two free trial classes/i);
    expect(txt).toMatch(/one free 60-minute trial lesson/i);
  });

  it('src/data/home.js features[0] offers one free trial lesson, not two', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../data/home.js'), 'utf8');
    expect(src).not.toMatch(/two complimentary trial lessons/i);
    expect(src).toMatch(/siteFacts\.trialLessonMinutes/);
  });
});

describe('FAQ plan names/counts/prices stay in sync with src/data/home.js `plans` (Part 5)', () => {
  it('plans still has exactly Noorani/Huffaz/Ijazah, in that order, with the expected sessions-per-week', () => {
    expect(plans.map((p) => p.name)).toEqual(['Noorani', 'Huffaz', 'Ijazah']);
    expect(plans.find((p) => p.name === 'Noorani').sessionsPerWeek).toBe(2);
    expect(plans.find((p) => p.name === 'Huffaz').sessionsPerWeek).toBe(3);
    expect(plans.find((p) => p.name === 'Ijazah').sessionsPerWeek).toBe(4);
  });

  it('FAQ pricing item (index 6) contains the live plan names and prices, never Starter/Standard/Premium', () => {
    const item = faqItems[6];
    const noorani = plans.find((p) => p.name === 'Noorani');
    const huffaz = plans.find((p) => p.name === 'Huffaz');
    const ijazah = plans.find((p) => p.name === 'Ijazah');
    for (const lang of ['en', 'ar', 'it', 'es', 'de', 'fr']) {
      const answer = item[lang].a;
      expect(answer, `${lang} should not say Starter`).not.toMatch(/\bStarter\b/);
      expect(answer, `${lang} should not say Standard plan`).not.toMatch(/\bStandard\b/);
      expect(answer, `${lang} should not say Premium plan`).not.toMatch(/\bPremium\b/);
      expect(answer, `${lang} should contain Noorani's price`).toContain(noorani.price);
      expect(answer, `${lang} should contain Huffaz's price`).toContain(huffaz.price);
      expect(answer, `${lang} should contain Ijazah's price`).toContain(ijazah.price);
    }
  });
});
