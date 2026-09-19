import { describe, it, expect } from 'vitest';
import { LANGS } from '../i18n';
import { TRANSLATION_STATUS, isPublished } from '../data/translationStatus';
import { IJAZAH_TEXT } from '../i18n/courses/ijazah';
import { IJAZAH_STAGES, IJAZAH_BOOKS } from '../data/courses/ijazah';

// Phase 2b (2026-09-18): CourseIjazah.jsx's inline isAr-forked consts
// (LEARN/STAGES/BOOKS/PREREQS/FOR/PERKS + inline hero/stats/SEO ternaries)
// were removed and replaced by these two modules. The point of this file is
// to prove, directly and by name, the four things the migration was
// required to preserve/establish -- not just rely on the generic
// contentCompleteness.test.js / translationStatus.test.js coverage that
// happens to also exercise this route.

function keyPaths(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object') return [`${prefix}:${typeof obj}`];
  const paths = [];
  if (Array.isArray(obj)) {
    paths.push(`${prefix}:array(${obj.length})`);
    obj.forEach((value, index) => paths.push(...keyPaths(value, `${prefix}[${index}]`)));
    return paths;
  }
  for (const [key, value] of Object.entries(obj)) paths.push(...keyPaths(value, prefix ? `${prefix}.${key}` : key));
  return paths;
}

function leafValues(obj, prefix = '', leaves = {}) {
  if (Array.isArray(obj)) obj.forEach((v, i) => leafValues(v, `${prefix}[${i}]`, leaves));
  else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) leafValues(value, prefix ? `${prefix}.${key}` : key, leaves);
  } else leaves[prefix] = obj;
  return leaves;
}

describe('1. English/Arabic structural parity', () => {
  it('ar has exactly the same key structure as en (no missing/extra keys)', () => {
    const enPaths = new Set(keyPaths(IJAZAH_TEXT.en));
    const arPaths = new Set(keyPaths(IJAZAH_TEXT.ar));
    expect([...enPaths].filter((p) => !arPaths.has(p))).toEqual([]);
    expect([...arPaths].filter((p) => !enPaths.has(p))).toEqual([]);
  });

  it('it/es/de/fr are genuinely absent, not silently present as broken/empty stand-ins', () => {
    for (const lang of ['it', 'es', 'de', 'fr']) {
      expect(IJAZAH_TEXT[lang]).toBeUndefined();
    }
  });
});

describe('2. No missing/empty text values', () => {
  it('no empty-string leaf anywhere in en or ar', () => {
    for (const lang of ['en', 'ar']) {
      const leaves = leafValues(IJAZAH_TEXT[lang]);
      const empty = Object.entries(leaves).filter(([, v]) => typeof v === 'string' && v.trim() === '');
      expect(empty).toEqual([]);
    }
  });

  it('every stage id in the structural data has a matching text entry, and vice versa', () => {
    const structuralIds = new Set(IJAZAH_STAGES.map((s) => s.id));
    for (const lang of ['en', 'ar']) {
      const textIds = new Set(Object.keys(IJAZAH_TEXT[lang].stages));
      expect([...structuralIds].filter((id) => !textIds.has(id))).toEqual([]);
      expect([...textIds].filter((id) => !structuralIds.has(id))).toEqual([]);
    }
  });

  it('every book id in the structural data has a matching text entry, and vice versa', () => {
    const structuralIds = new Set(IJAZAH_BOOKS.map((b) => b.id));
    for (const lang of ['en', 'ar']) {
      const textIds = new Set(Object.keys(IJAZAH_TEXT[lang].books));
      expect([...structuralIds].filter((id) => !textIds.has(id))).toEqual([]);
      expect([...textIds].filter((id) => !structuralIds.has(id))).toEqual([]);
    }
  });
});

describe('3. Arabic renders normally (registry bookkeeping, not a content regression)', () => {
  // Arabic Cross-Page Shell Repair (2026-09-xx): downgraded from 'published'
  // to 'legacy' here -- IJAZAH_TEXT.ar (checked above in this same file) is
  // still structurally complete, but a full-page audit found the page SHELL
  // around it (Breadcrumbs, JSON-LD/meta description) still leaked English.
  // 'legacy' still renders normally for visitors (isPublished() stays
  // true); see translationStatus.js's own comment on this route and
  // translationStatus.test.js for the full reasoning.
  it('/courses/ijazah ar status is legacy (not published) in the registry, but still renders normally', () => {
    expect(TRANSLATION_STATUS['/courses/ijazah'].languages.ar.status).toBe('legacy');
    expect(isPublished('/courses/ijazah', 'ar')).toBe(true);
  });

  it('the registry now points at the migrated content module, not just the page file', () => {
    const sources = TRANSLATION_STATUS['/courses/ijazah'].contentSources;
    expect(sources).toContain('src/i18n/courses/ijazah.js');
    expect(sources).toContain('src/data/courses/ijazah.js');
  });
});

describe('4. it/es/de/fr are still draft and still guarded', () => {
  it('it/es/de/fr remain draft in the registry', () => {
    for (const lang of ['it', 'es', 'de', 'fr']) {
      expect(TRANSLATION_STATUS['/courses/ijazah'].languages[lang].status).toBe('draft');
      expect(isPublished('/courses/ijazah', lang)).toBe(false);
    }
  });

  it('en is (still, implicitly) published for every language code LANGS knows about, i.e. isPublished is not accidentally inverted', () => {
    for (const lang of LANGS) expect(isPublished('/courses/ijazah', 'en')).toBe(true);
  });
  // The actual runtime block (TranslationGate rendering TranslationInProgress
  // instead of the real page for it/es/de/fr) is proven behaviorally in
  // src/test/TranslationGate.test.jsx, which already targets this exact
  // route -- not duplicated here.
});

describe('Content preservation spot-check (representative sample, every section, both languages)', () => {
  // These are exact strings from the pre-migration CourseIjazah.jsx (the
  // version with inline LEARN/STAGES/BOOKS/PREREQS/FOR/PERKS consts and
  // isAr ternaries), copied here as a literal comparison -- if content
  // drifted during migration, this fails immediately and specifically.
  it('seo/hero/stats (en)', () => {
    expect(IJAZAH_TEXT.en.seo.title).toBe('Quran Ijazah Course');
    expect(IJAZAH_TEXT.en.hero.sub).toBe(
      'Earn a formal Ijazah with a continuous chain of transmission (Sanad) connected directly to the Prophet Muhammad ﷺ — and become authorised to teach the Quran.',
    );
    expect(IJAZAH_TEXT.en.stats[3]).toEqual({ value: '4 Stages', label: 'Structured Curriculum' });
  });

  it('seo/hero/stats (ar)', () => {
    expect(IJAZAH_TEXT.ar.seo.title).toBe('دورة إجازة القرآن الكريم');
    expect(IJAZAH_TEXT.ar.hero.sub).toBe(
      'احصل على إجازة رسمية بسند متصل مباشرةً إلى النبي محمد ﷺ — ويصبح لك الحق في تدريس القرآن الكريم.',
    );
    expect(IJAZAH_TEXT.ar.stats[3]).toEqual({ value: '٤ مراحل', label: 'منهج منظم' });
  });

  it('learn list (en/ar), first and last item', () => {
    expect(IJAZAH_TEXT.en.learn[0]).toBe('Complete mastery of all Tajweed rules — Hafs & Warsh');
    expect(IJAZAH_TEXT.en.learn.at(-1)).toBe('Authorisation to teach the Quran with your own Sanad');
    expect(IJAZAH_TEXT.ar.learn[0]).toBe('إتقان كامل لجميع أحكام التجويد — رواية حفص وورش');
    expect(IJAZAH_TEXT.ar.learn.at(-1)).toBe('الإذن الرسمي بتدريس القرآن الكريم وإصدار إجازات');
  });

  it('stages: certification stage sourceLine differs by language exactly as the original isAr ternary produced', () => {
    // Original: isAr ? s.source : `${s.sourceEn} — ${s.author}`
    expect(IJAZAH_TEXT.en.stages.certification.sourceLine).toBe("Madinah Mus'haf — مجمع الملك فهد لطباعة المصحف الشريف");
    expect(IJAZAH_TEXT.ar.stages.certification.sourceLine).toBe('مصحف المدينة النبوية');
    expect(IJAZAH_STAGES.find((s) => s.id === 'certification').source).toBe('مصحف المدينة النبوية');
  });

  it('stages: intermediate stage points, full array (en/ar)', () => {
    expect(IJAZAH_TEXT.en.stages.intermediate.points).toEqual([
      "All Madd rules — Tabee'i, Muttasil, Munfasil, 'Aarid, Leen",
      'Lam Al-Shamsiyyah & Al-Qamariyyah',
      'Tafkheem & Tarqeeq — heavy and light letters in detail',
      'Ra letter rules — conditions of heaviness and lightness',
      'Mutaqaribain, Mutajanisain, Mutamatilain',
      "Rules of Waqf & Ibtida' — 12 waqf signs explained",
    ]);
    expect(IJAZAH_TEXT.ar.stages.intermediate.points).toEqual([
      'أحكام المدود جميعها — طبيعي، متصل، منفصل، عارض، لين',
      'اللام الشمسية واللام القمرية',
      'التفخيم والترقيق — الحروف المفخمة والمرققة تفصيلاً',
      'أحكام الراء — شروط التفخيم والترقيق',
      'المتقاربان والمتجانسان والمتماثلان',
      'أحكام الوقف والابتداء — علامات الوقف الـ 12',
    ]);
  });

  it('books: madinah-mushaf full entry (en/ar) and structural fields', () => {
    expect(IJAZAH_TEXT.en.books['madinah-mushaf']).toEqual({
      author: 'King Fahd Glorious Quran Printing Complex',
      stage: 'Certification Stage',
      desc: "The world's most widely distributed Mus'haf — printed by the official Saudi complex in Madinah. Used for the final certification recitation in the Hafs 'an 'Asim riwayah.",
      topics: ["Hafs 'an 'Asim riwayah", 'Colour-coded Tajweed edition available', 'Used in the final Ijazah exam'],
      linkLabel: 'Read Online — Official Site',
    });
    expect(IJAZAH_TEXT.ar.books['madinah-mushaf']).toEqual({
      author: 'مجمع الملك فهد لطباعة المصحف الشريف',
      stage: 'مرحلة الإجازة',
      desc: 'أكثر مصحف توزيعاً في العالم — تطبعه مجمع الملك فهد الرسمي في المدينة المنورة. يُستخدم في اختبار الإجازة النهائي برواية حفص عن عاصم.',
      topics: ['رواية حفص عن عاصم', 'متوفر بنسخة تجويد ملوّنة', 'يُستخدم في اختبار الإجازة النهائي'],
      linkLabel: 'اقرأ أونلاين — الموقع الرسمي',
    });
    const book = IJAZAH_BOOKS.find((b) => b.id === 'madinah-mushaf');
    expect(book).toEqual({ id: 'madinah-mushaf', icon: '📕', title: "Madinah Mus'haf", ar: 'مصحف المدينة النبوية', link: 'https://quran.gov.sa' });
  });

  it('prereqs/for/perks/enrollCard (en/ar), full arrays', () => {
    expect(IJAZAH_TEXT.en.prereqs).toEqual([
      { icon: '📖', text: 'Fluent Quran reading (Noorani Qaida completed)' },
      { icon: '🎙️', text: 'Basic Tajweed knowledge (Tuhfat Al-Atfal level)' },
      { icon: '⏱️', text: 'Commitment to at least 3 lessons per week' },
      { icon: '🧠', text: 'Recommended: Hifz (memorization) program completed' },
    ]);
    expect(IJAZAH_TEXT.ar.perks).toEqual([
      'فردي مع شيخ مجاز معتمد', 'جدول أسبوعي مرن', 'زووم / سكايب / جوجل ميت',
      'تقارير تقدم شهرية', 'وثيقة السند الرسمية', 'إلغاء في أي وقت',
    ]);
    expect(IJAZAH_TEXT.en.enrollCard.title).toBe('Quran Ijazah');
    expect(IJAZAH_TEXT.ar.enrollCard.title).toBe('إجازة القرآن الكريم');
    expect(IJAZAH_TEXT.en.breadcrumbLabel).toBe('Quran Ijazah Course');
    expect(IJAZAH_TEXT.ar.breadcrumbLabel).toBe('دورة الإجازة');
  });
});
