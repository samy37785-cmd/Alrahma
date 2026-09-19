import { describe, it, expect } from 'vitest';
import { LANGS } from '../i18n';
import { TRANSLATION_STATUS, isPublished } from '../data/translationStatus';
import { ISLAMIC_STUDIES_TEXT } from '../i18n/courses/islamic-studies';
import { ISLAMIC_STUDIES_HADITHS, ISLAMIC_STUDIES_MODULES, ISLAMIC_STUDIES_BOOKS } from '../data/courses/islamic-studies';

// Phase 2c (2026-09-18): CourseIslamicStudies.jsx's inline isAr-forked
// SEO/hero/stats/hadith/module/enroll strings, plus the old
// src/data/islamicStudiesData.js (HADITHS/MODULES/BOOKS/LEARN/FOR/PERKS)
// and IslamicStudiesBookCard.jsx's isAr forks, were removed and replaced by
// these two modules -- mirroring courseIjazahMigration.test.js's structure
// exactly. This file proves, directly and by name, the things the
// migration was required to preserve/establish.

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
    const enPaths = new Set(keyPaths(ISLAMIC_STUDIES_TEXT.en));
    const arPaths = new Set(keyPaths(ISLAMIC_STUDIES_TEXT.ar));
    expect([...enPaths].filter((p) => !arPaths.has(p))).toEqual([]);
    expect([...arPaths].filter((p) => !enPaths.has(p))).toEqual([]);
  });

  it('it/es/de/fr are genuinely absent, not silently present as broken/empty stand-ins', () => {
    for (const lang of ['it', 'es', 'de', 'fr']) {
      expect(ISLAMIC_STUDIES_TEXT[lang]).toBeUndefined();
    }
  });
});

describe('2. No missing/empty text values, and structural <-> text id linkage', () => {
  it('no empty-string leaf anywhere in en or ar', () => {
    for (const lang of ['en', 'ar']) {
      const leaves = leafValues(ISLAMIC_STUDIES_TEXT[lang]);
      const empty = Object.entries(leaves).filter(([, v]) => typeof v === 'string' && v.trim() === '');
      expect(empty).toEqual([]);
    }
  });

  it('every hadith id in the structural data has a matching text entry, and vice versa', () => {
    const structuralIds = new Set(ISLAMIC_STUDIES_HADITHS.map((h) => h.id));
    expect(structuralIds.size).toBe(ISLAMIC_STUDIES_HADITHS.length); // ids are unique -- array-index lookup by "day of year" depends on this
    for (const lang of ['en', 'ar']) {
      const textIds = new Set(Object.keys(ISLAMIC_STUDIES_TEXT[lang].hadiths));
      expect([...structuralIds].filter((id) => !textIds.has(id))).toEqual([]);
      expect([...textIds].filter((id) => !structuralIds.has(id))).toEqual([]);
    }
  });

  it('every module id in the structural data has a matching text entry, and vice versa', () => {
    const structuralIds = new Set(ISLAMIC_STUDIES_MODULES.map((m) => m.id));
    for (const lang of ['en', 'ar']) {
      const textIds = new Set(Object.keys(ISLAMIC_STUDIES_TEXT[lang].modules));
      expect([...structuralIds].filter((id) => !textIds.has(id))).toEqual([]);
      expect([...textIds].filter((id) => !structuralIds.has(id))).toEqual([]);
    }
  });

  it('every book id in the structural data has a matching text entry, and vice versa', () => {
    const structuralIds = new Set(ISLAMIC_STUDIES_BOOKS.map((b) => b.id));
    for (const lang of ['en', 'ar']) {
      const textIds = new Set(Object.keys(ISLAMIC_STUDIES_TEXT[lang].books));
      expect([...structuralIds].filter((id) => !textIds.has(id))).toEqual([]);
      expect([...textIds].filter((id) => !structuralIds.has(id))).toEqual([]);
    }
  });

  it('libraryNote is present on exactly one book id (arbaeen-nawawiyyah), in both en and ar -- not a migration gap, matches the original data', () => {
    for (const lang of ['en', 'ar']) {
      const booksWithNote = Object.entries(ISLAMIC_STUDIES_TEXT[lang].books).filter(([, b]) => 'libraryNote' in b);
      expect(booksWithNote.map(([id]) => id)).toEqual(['arbaeen-nawawiyyah']);
    }
  });
});

describe('3. Arabic renders normally (registry bookkeeping, not a content regression)', () => {
  // Arabic Cross-Page Shell Repair (2026-09-xx): downgraded from 'published'
  // to 'legacy' here -- ISLAMIC_STUDIES_TEXT.ar (checked above in this same
  // file) is still structurally complete, but a full-page audit found the
  // page SHELL around it (Breadcrumbs, JSON-LD/meta description) still
  // leaked English. 'legacy' still renders normally for visitors
  // (isPublished() stays true); see translationStatus.js's own comment on
  // this route and translationStatus.test.js for the full reasoning.
  it('/courses/islamic-studies ar status is legacy (not published) in the registry, but still renders normally', () => {
    expect(TRANSLATION_STATUS['/courses/islamic-studies'].languages.ar.status).toBe('legacy');
    expect(isPublished('/courses/islamic-studies', 'ar')).toBe(true);
  });

  it('the registry now points at the migrated content module, not the old islamicStudiesData.js', () => {
    const sources = TRANSLATION_STATUS['/courses/islamic-studies'].contentSources;
    expect(sources).toContain('src/i18n/courses/islamic-studies.js');
    expect(sources).toContain('src/data/courses/islamic-studies.js');
    expect(sources).not.toContain('src/data/islamicStudiesData.js');
  });
});

describe('4. it/es/de/fr are still draft and still guarded', () => {
  it('it/es/de/fr remain draft in the registry', () => {
    for (const lang of ['it', 'es', 'de', 'fr']) {
      expect(TRANSLATION_STATUS['/courses/islamic-studies'].languages[lang].status).toBe('draft');
      expect(isPublished('/courses/islamic-studies', lang)).toBe(false);
    }
  });

  it('en is (still, implicitly) published for every language code LANGS knows about, i.e. isPublished is not accidentally inverted', () => {
    for (const lang of LANGS) expect(isPublished('/courses/islamic-studies', 'en')).toBe(true);
  });
  // The actual runtime block (TranslationGate rendering TranslationInProgress
  // instead of the real page for it/es/de/fr) is proven behaviorally in
  // src/test/TranslationGate.test.jsx for /courses/ijazah; /courses/islamic-studies
  // is wrapped in the same TranslationGate in App.jsx (unchanged since Phase 1),
  // not re-proven per-route here.
});

describe('Content preservation spot-check (representative sample, every section, both languages)', () => {
  // Exact strings from the pre-migration CourseIslamicStudies.jsx /
  // islamicStudiesData.js / IslamicStudiesBookCard.jsx, copied here as a
  // literal comparison. This is a representative sample, not an exhaustive
  // character-by-character proof of every item (see the Phase 2b review
  // correction for why that distinction matters).
  it('seo/hero/stats (en)', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.seo.title).toBe('Islamic Studies Course');
    expect(ISLAMIC_STUDIES_TEXT.en.hero.sub).toBe(
      'A comprehensive, source-based curriculum covering Aqeedah, Fiqh, Seerah, Hadith and Tafsir — taught by certified scholars in your own language.',
    );
    expect(ISLAMIC_STUDIES_TEXT.en.stats[4]).toEqual({ value: '6 Lang', label: 'Instruction Languages' });
  });

  it('seo/hero/stats (ar)', () => {
    expect(ISLAMIC_STUDIES_TEXT.ar.seo.title).toBe('دورة الدراسات الإسلامية');
    expect(ISLAMIC_STUDIES_TEXT.ar.breadcrumbLabel).toBe('الدراسات الإسلامية');
    expect(ISLAMIC_STUDIES_TEXT.ar.stats[4]).toEqual({ value: '٦ لغات', label: 'لغات التدريس' });
  });

  it('learn list (en/ar), first and last item', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.learn[0]).toBe('Core Aqeedah — Tawhid, all six pillars of faith, and Islamic theology');
    expect(ISLAMIC_STUDIES_TEXT.en.learn.at(-1)).toBe('Lessons available in English, Arabic, Italian, French, German, or Spanish');
    expect(ISLAMIC_STUDIES_TEXT.ar.learn[0]).toBe('العقيدة الأساسية — التوحيد وأركان الإيمان الستة وعلم الكلام الإسلامي');
    expect(ISLAMIC_STUDIES_TEXT.ar.learn.at(-1)).toBe('الحصص متاحة بالعربية والإنجليزية والإيطالية والفرنسية والألمانية والإسبانية');
  });

  it('hadith of the day: nawawi-1 full entry (en/ar) plus structural fields, matching the original array order (position 0)', () => {
    expect(ISLAMIC_STUDIES_HADITHS[0]).toEqual({
      id: 'nawawi-1',
      arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
      url: 'https://sunnah.com/nawawi40:1',
    });
    expect(ISLAMIC_STUDIES_TEXT.en.hadiths['nawawi-1']).toEqual({
      text: 'Actions are but by intention, and every man shall have only that which he intended.',
      narrator: 'Umar ibn Al-Khattab (RA)',
      source: "Hadith 1 — Al-Arba'een Al-Nawawiyyah",
    });
    expect(ISLAMIC_STUDIES_TEXT.ar.hadiths['nawawi-1']).toEqual({
      text: 'إنما الأعمال بالنيات، وإنما لكل امرئٍ ما نوى.',
      narrator: 'عمر بن الخطاب (رضي الله عنه)',
      source: 'الحديث الأول — الأربعون النووية',
    });
  });

  it('the last hadith (Al-Tabarani, not Al-Arba\'een) keeps its distinct source string -- proves the migration did not just copy-paste a shared "Al-Arba\'een" source onto every item', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.hadiths['tabarani-khair-annas'].source).toBe("Al-Mu'jam Al-Awsat — Al-Tabarani");
    expect(ISLAMIC_STUDIES_TEXT.ar.hadiths['tabarani-khair-annas'].source).toBe('المعجم الأوسط — الطبراني');
  });

  it('modules: hadith-ethics module full topics array (en/ar) and structural fields', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.modules['hadith-ethics'].topics).toEqual([
      '40 core hadiths with full explanation and context',
      'Introduction to Hadith sciences (Mustalah Al-Hadith)',
      'Islamic ethics (Akhlaq) from the Prophetic example ﷺ',
      'Rights of Allah, rights of the self, rights of others',
      'Practical application in modern daily life',
    ]);
    expect(ISLAMIC_STUDIES_TEXT.ar.modules['hadith-ethics'].topics).toEqual([
      '٤٠ حديثاً أساسياً مع الشرح الكامل والسياق',
      'مدخل إلى علوم الحديث (مصطلح الحديث)',
      'الأخلاق الإسلامية من هديه ﷺ',
      'حقوق الله وحقوق النفس وحقوق الآخرين',
      'التطبيق العملي في الحياة اليومية المعاصرة',
    ]);
    const mod = ISLAMIC_STUDIES_MODULES.find((m) => m.id === 'hadith-ethics');
    expect(mod).toEqual({ id: 'hadith-ethics', num: '04', icon: '📜', color: '#c07020', sourceAr: 'الأربعون النووية' });
  });

  it('books: arbaeen-nawawiyyah full entry (en/ar, including libraryNote) and structural fields', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.books['arbaeen-nawawiyyah']).toEqual({
      author: 'Imam Yahya ibn Sharaf Al-Nawawi (d. 676 AH)',
      module: '📜 Hadith & Ethics — Primary source',
      desc: '42 hadiths chosen by Imam Al-Nawawi as the most comprehensive summary of Islamic teachings. Every single hadith is considered a foundation of the religion — the essential starting point for every Muslim student.',
      topics: [
        '42 core hadiths — the pillars of Islam & Iman',
        'Ihsan — worshipping Allah as though you see Him',
        'Halal, Haram, and doubtful matters',
        'Anger, sincerity, and daily conduct',
      ],
      linkLabel: 'Read all 42 hadiths — Sunnah.com',
      libraryNote: '📚 Browse this full collection in our Hadith Library',
    });
    const book = ISLAMIC_STUDIES_BOOKS.find((b) => b.id === 'arbaeen-nawawiyyah');
    expect(book).toEqual({ id: 'arbaeen-nawawiyyah', icon: '📒', title: "Al-Arba'een Al-Nawawiyyah", ar: 'الأربعون النووية', link: 'https://sunnah.com/nawawi40' });
  });

  it('a book with no libraryNote (bulugh-al-maram) genuinely has none, in either language', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.books['bulugh-al-maram'].libraryNote).toBeUndefined();
    expect(ISLAMIC_STUDIES_TEXT.ar.books['bulugh-al-maram'].libraryNote).toBeUndefined();
  });

  it('for/perks/enrollCard (en/ar), full arrays', () => {
    expect(ISLAMIC_STUDIES_TEXT.en.for).toEqual([
      { icon: '🌱', label: 'New Muslims who want a solid, structured Islamic foundation' },
      { icon: '👨‍👩‍👧', label: 'Families wanting to educate children in authentic Islamic knowledge' },
      { icon: '🌍', label: 'Western Muslims who want to learn Islam in their own language' },
      { icon: '📚', label: 'Anyone who wants source-based Islamic education — not just opinions' },
    ]);
    expect(ISLAMIC_STUDIES_TEXT.ar.perks).toEqual([
      'فردي مع عالم معتمد', 'اختر وحدتك الأولى', 'متاح بـ ٦ لغات',
      'جدول أسبوعي مرن', 'زووم / سكايب / جوجل ميت', 'إلغاء في أي وقت',
    ]);
    expect(ISLAMIC_STUDIES_TEXT.en.enrollCard).toEqual({ title: 'Islamic Studies', sub: '5 Modules · All Levels' });
    expect(ISLAMIC_STUDIES_TEXT.ar.enrollCard).toEqual({ title: 'الدراسات الإسلامية', sub: '٥ وحدات · جميع المستويات' });
  });
});
