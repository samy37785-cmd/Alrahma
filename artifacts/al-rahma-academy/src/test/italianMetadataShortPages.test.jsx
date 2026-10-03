import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Adhkar from '../pages/Adhkar';
import FAQ from '../pages/FAQ';
import TajweedCheckerPage from '../pages/tools/TajweedCheckerPage';
import ArabicAlphabetPage from '../pages/tools/ArabicAlphabetPage';
import VerseOfTheDayPage from '../pages/tools/VerseOfTheDayPage';
import { IT_META_DESCRIPTIONS, pickItMetaDescription } from '../i18n/itMetaDescriptions';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian SEO Meta Descriptions, Wave 1 (short pages): only the <meta name="description">
// (and its og:/twitter: copies) of five Italian pages changed. The 120-160 range below is
// scoped to these five pages, not a site-wide rule. Length is counted in Unicode code
// points ([...s].length), the same way frenchP2ContentMetadata.test.jsx counts.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist/public');
const distExists = fs.existsSync(DIST);
useFullPageEnvironment();

const sha = (s) => createHash('sha256').update(s).digest('hex');
const len = (s) => [...s].length;

const NEW = {
  '/it/tools/adhkar': "Adhkar e du'a da Hisnul Muslim per mattino, sera, prima di dormire e dopo la preghiera: testo arabo con diacritici, fonti e contatore delle ripetizioni.",
  '/it/resources/faq': 'Risposte alle domande più frequenti su lezioni online di Corano, insegnanti, prenotazione della prova gratuita, piani, rimborsi e requisiti tecnici.',
  '/it/tools/tajweed-checker': 'Strumento didattico per esercitarti col Tajweed: recita un versetto ad alta voce, vedi cosa ha riconosciuto il browser e ricevi un feedback.',
  '/it/tools/arabic-alphabet': 'Strumento interattivo per le 28 lettere arabe: ascolta la pronuncia, esercitati con il microfono e riascolta le registrazioni dell’alfabeto completo.',
  '/it/tools/verse-of-the-day': 'Un versetto del Corano ogni giorno: testo arabo, riferimento e traduzione da fonte esterna. Per iniziare la giornata con le parole di Allah.',
};
const PAGES = {
  '/it/tools/adhkar': Adhkar,
  '/it/resources/faq': FAQ,
  '/it/tools/tajweed-checker': TajweedCheckerPage,
  '/it/tools/arabic-alphabet': ArabicAlphabetPage,
  '/it/tools/verse-of-the-day': VerseOfTheDayPage,
};
const OLD = {
  '/it/tools/adhkar': 'Adhkar quotidiani con diacritici completi, virtù e fonti',
  '/it/resources/faq': 'Tutto ciò che devi sapere su Al-Rahma Academy e sui nostri corsi di Corano online.',
  '/it/tools/tajweed-checker': "Esercitati nella recitazione del Corano e ricevi un feedback immediato dell'IA sul tuo Tajweed",
  '/it/tools/arabic-alphabet': 'Impara le 28 lettere arabe con pronuncia audio ed esercizi interattivi — gratis con Al-Rahma Academy.',
  '/it/tools/verse-of-the-day': 'Un versetto del Corano scelto ogni giorno con traduzione — inizia la giornata con le parole di Allah.',
};
const ROUTES = Object.keys(NEW);
const COURSE_ARABIC_IT = 'Impara le 28 lettere arabe con pronuncia audio ed esercizi interattivi — ideale per chi inizia il proprio percorso con il Corano.';

// origin/main raw-prerender facts (production at e888fc1, before this change). Italian
// descriptions are omitted on purpose: they are the NEW values above.
const BASE = {
  "en/tools/adhkar": {
    "title": "Adhkar & Du'a Library | AL-Rahma Academy",
    "h1": "Adhkar & Du'a Library",
    "canonical": "https://al-rahmaacademy.com/tools/adhkar",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/adhkar",
      "ar=https://al-rahmaacademy.com/ar/tools/adhkar",
      "fr=https://al-rahmaacademy.com/fr/tools/adhkar",
      "it=https://al-rahmaacademy.com/it/tools/adhkar",
      "x-default=https://al-rahmaacademy.com/tools/adhkar"
    ],
    "description": "Daily adhkar with full diacritics, virtues & sources"
  },
  "en/resources/faq": {
    "title": "Frequently Asked Questions | AL-Rahma Academy",
    "h1": "Frequently Asked Questions",
    "canonical": "https://al-rahmaacademy.com/resources/faq",
    "hreflang": [
      "en=https://al-rahmaacademy.com/resources/faq",
      "ar=https://al-rahmaacademy.com/ar/resources/faq",
      "fr=https://al-rahmaacademy.com/fr/resources/faq",
      "it=https://al-rahmaacademy.com/it/resources/faq",
      "x-default=https://al-rahmaacademy.com/resources/faq"
    ],
    "description": "Everything you need to know about Al-Rahma Academy and our online Quran courses."
  },
  "en/tools/tajweed-checker": {
    "title": "AI Tajweed Checker | AL-Rahma Academy",
    "h1": "Tajweed Checker",
    "canonical": "https://al-rahmaacademy.com/tools/tajweed-checker",
    "hreflang": [
      "it=https://al-rahmaacademy.com/it/tools/tajweed-checker",
      "en=https://al-rahmaacademy.com/tools/tajweed-checker",
      "ar=https://al-rahmaacademy.com/ar/tools/tajweed-checker",
      "fr=https://al-rahmaacademy.com/fr/tools/tajweed-checker",
      "x-default=https://al-rahmaacademy.com/tools/tajweed-checker"
    ],
    "description": "Practice Quran recitation and get instant AI feedback on your Tajweed"
  },
  "en/tools/arabic-alphabet": {
    "title": "Arabic Alphabet | AL-Rahma Academy",
    "h1": "Arabic Alphabet",
    "canonical": "https://al-rahmaacademy.com/tools/arabic-alphabet",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/arabic-alphabet",
      "ar=https://al-rahmaacademy.com/ar/tools/arabic-alphabet",
      "fr=https://al-rahmaacademy.com/fr/tools/arabic-alphabet",
      "it=https://al-rahmaacademy.com/it/tools/arabic-alphabet",
      "x-default=https://al-rahmaacademy.com/tools/arabic-alphabet"
    ],
    "description": "Learn the 28 Arabic letters with audio pronunciation and interactive exercises — free from Al-Rahma Academy."
  },
  "en/courses/arabic": {
    "title": "Arabic Alphabet Course | AL-Rahma Academy",
    "h1": "Arabic & Italian Alphabet",
    "canonical": "https://al-rahmaacademy.com/courses/arabic",
    "hreflang": [
      "en=https://al-rahmaacademy.com/courses/arabic",
      "ar=https://al-rahmaacademy.com/ar/courses/arabic",
      "fr=https://al-rahmaacademy.com/fr/courses/arabic",
      "it=https://al-rahmaacademy.com/it/courses/arabic",
      "x-default=https://al-rahmaacademy.com/courses/arabic"
    ],
    "description": "Learn the 28 Arabic letters with audio pronunciation and interactive exercises — ideal for beginners starting their Quran journey."
  },
  "ar/tools/adhkar": {
    "title": "مكتبة الأذكار والأدعية | AL-Rahma Academy",
    "h1": "مكتبة الأذكار والأدعية",
    "canonical": "https://al-rahmaacademy.com/ar/tools/adhkar",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/adhkar",
      "ar=https://al-rahmaacademy.com/ar/tools/adhkar",
      "fr=https://al-rahmaacademy.com/fr/tools/adhkar",
      "it=https://al-rahmaacademy.com/it/tools/adhkar",
      "x-default=https://al-rahmaacademy.com/tools/adhkar"
    ],
    "description": "أذكار يومية بتشكيل كامل مع الفضائل والمصادر"
  },
  "ar/resources/faq": {
    "title": "الأسئلة الشائعة | AL-Rahma Academy",
    "h1": "الأسئلة الشائعة",
    "canonical": "https://al-rahmaacademy.com/ar/resources/faq",
    "hreflang": [
      "en=https://al-rahmaacademy.com/resources/faq",
      "ar=https://al-rahmaacademy.com/ar/resources/faq",
      "fr=https://al-rahmaacademy.com/fr/resources/faq",
      "it=https://al-rahmaacademy.com/it/resources/faq",
      "x-default=https://al-rahmaacademy.com/resources/faq"
    ],
    "description": "كل ما تحتاج معرفته عن أكاديمية الرحمة ودوراتنا الإلكترونية في القرآن الكريم."
  },
  "ar/tools/tajweed-checker": {
    "title": "مدقق التجويد بالذكاء الاصطناعي | AL-Rahma Academy",
    "h1": "مدقق التجويد",
    "canonical": "https://al-rahmaacademy.com/ar/tools/tajweed-checker",
    "hreflang": [
      "it=https://al-rahmaacademy.com/it/tools/tajweed-checker",
      "en=https://al-rahmaacademy.com/tools/tajweed-checker",
      "ar=https://al-rahmaacademy.com/ar/tools/tajweed-checker",
      "fr=https://al-rahmaacademy.com/fr/tools/tajweed-checker",
      "x-default=https://al-rahmaacademy.com/tools/tajweed-checker"
    ],
    "description": "تدرّب على تلاوة القرآن الكريم واحصل على تقييم فوري بالذكاء الاصطناعي"
  },
  "ar/tools/arabic-alphabet": {
    "title": "الأبجدية العربية | AL-Rahma Academy",
    "h1": "الأبجدية العربية",
    "canonical": "https://al-rahmaacademy.com/ar/tools/arabic-alphabet",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/arabic-alphabet",
      "ar=https://al-rahmaacademy.com/ar/tools/arabic-alphabet",
      "fr=https://al-rahmaacademy.com/fr/tools/arabic-alphabet",
      "it=https://al-rahmaacademy.com/it/tools/arabic-alphabet",
      "x-default=https://al-rahmaacademy.com/tools/arabic-alphabet"
    ],
    "description": "تعلّم الحروف العربية الـ٢٨ مع النطق الصوتي والتدريبات التفاعلية — مجاناً من أكاديمية الرحمة."
  },
  "ar/courses/arabic": {
    "title": "دورة الحروف العربية | AL-Rahma Academy",
    "h1": "الحروف العربية",
    "canonical": "https://al-rahmaacademy.com/ar/courses/arabic",
    "hreflang": [
      "en=https://al-rahmaacademy.com/courses/arabic",
      "ar=https://al-rahmaacademy.com/ar/courses/arabic",
      "fr=https://al-rahmaacademy.com/fr/courses/arabic",
      "it=https://al-rahmaacademy.com/it/courses/arabic",
      "x-default=https://al-rahmaacademy.com/courses/arabic"
    ],
    "description": "تعلّم الحروف العربية الـ28 مع النطق الصوتي وتمارين تفاعلية مباشرة في المتصفح — الخطوة الأولى المثالية قبل قراءة القرآن الكريم."
  },
  "fr/tools/adhkar": {
    "title": "Bibliothèque d’adhkar et de duʿa | AL-Rahma Academy",
    "h1": "Bibliothèque d’adhkar et de duʿa",
    "canonical": "https://al-rahmaacademy.com/fr/tools/adhkar",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/adhkar",
      "ar=https://al-rahmaacademy.com/ar/tools/adhkar",
      "fr=https://al-rahmaacademy.com/fr/tools/adhkar",
      "it=https://al-rahmaacademy.com/it/tools/adhkar",
      "x-default=https://al-rahmaacademy.com/tools/adhkar"
    ],
    "description": "Adhkar du matin, du soir, du coucher et après la prière : texte arabe vocalisé, mérites et sources tirés de Hisnul Muslim, avec compteur de répétitions."
  },
  "fr/resources/faq": {
    "title": "Questions fréquentes | AL-Rahma Academy",
    "h1": "Questions fréquentes",
    "canonical": "https://al-rahmaacademy.com/fr/resources/faq",
    "hreflang": [
      "en=https://al-rahmaacademy.com/resources/faq",
      "ar=https://al-rahmaacademy.com/ar/resources/faq",
      "fr=https://al-rahmaacademy.com/fr/resources/faq",
      "it=https://al-rahmaacademy.com/it/resources/faq",
      "x-default=https://al-rahmaacademy.com/resources/faq"
    ],
    "description": "Réponses à vos questions sur Al-Rahma Academy : nos cours de Coran en ligne, nos enseignants certifiés Al-Azhar et la leçon d'essai gratuite."
  },
  "fr/tools/tajweed-checker": {
    "title": "Vérificateur de tajwid par IA | AL-Rahma Academy",
    "h1": "Vérificateur de tajwid",
    "canonical": "https://al-rahmaacademy.com/fr/tools/tajweed-checker",
    "hreflang": [
      "it=https://al-rahmaacademy.com/it/tools/tajweed-checker",
      "en=https://al-rahmaacademy.com/tools/tajweed-checker",
      "ar=https://al-rahmaacademy.com/ar/tools/tajweed-checker",
      "fr=https://al-rahmaacademy.com/fr/tools/tajweed-checker",
      "x-default=https://al-rahmaacademy.com/tools/tajweed-checker"
    ],
    "description": "Entraînez-vous à réciter le Coran et recevez un retour instantané par IA sur votre tajwid"
  },
  "fr/tools/arabic-alphabet": {
    "title": "Alphabet arabe | AL-Rahma Academy",
    "h1": "Alphabet arabe",
    "canonical": "https://al-rahmaacademy.com/fr/tools/arabic-alphabet",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/arabic-alphabet",
      "ar=https://al-rahmaacademy.com/ar/tools/arabic-alphabet",
      "fr=https://al-rahmaacademy.com/fr/tools/arabic-alphabet",
      "it=https://al-rahmaacademy.com/it/tools/arabic-alphabet",
      "x-default=https://al-rahmaacademy.com/tools/arabic-alphabet"
    ],
    "description": "Apprenez les 28 lettres arabes avec leur prononciation audio et des exercices interactifs — gratuitement avec Al-Rahma Academy."
  },
  "fr/courses/arabic": {
    "title": "Cours d'alphabet arabe | AL-Rahma Academy",
    "h1": "Alphabet arabe et italien",
    "canonical": "https://al-rahmaacademy.com/fr/courses/arabic",
    "hreflang": [
      "en=https://al-rahmaacademy.com/courses/arabic",
      "ar=https://al-rahmaacademy.com/ar/courses/arabic",
      "fr=https://al-rahmaacademy.com/fr/courses/arabic",
      "it=https://al-rahmaacademy.com/it/courses/arabic",
      "x-default=https://al-rahmaacademy.com/courses/arabic"
    ],
    "description": "Apprenez les 28 lettres arabes avec la prononciation audio et des exercices interactifs — idéal pour les débutants qui commencent leur parcours avec le Coran."
  },
  "it/tools/adhkar": {
    "title": "Raccolta di adhkar e du'a | AL-Rahma Academy",
    "h1": "Raccolta di adhkar e du'a",
    "canonical": "https://al-rahmaacademy.com/it/tools/adhkar",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/adhkar",
      "ar=https://al-rahmaacademy.com/ar/tools/adhkar",
      "fr=https://al-rahmaacademy.com/fr/tools/adhkar",
      "it=https://al-rahmaacademy.com/it/tools/adhkar",
      "x-default=https://al-rahmaacademy.com/tools/adhkar"
    ]
  },
  "it/resources/faq": {
    "title": "Domande Frequenti | AL-Rahma Academy",
    "h1": "Domande Frequenti",
    "canonical": "https://al-rahmaacademy.com/it/resources/faq",
    "hreflang": [
      "en=https://al-rahmaacademy.com/resources/faq",
      "ar=https://al-rahmaacademy.com/ar/resources/faq",
      "fr=https://al-rahmaacademy.com/fr/resources/faq",
      "it=https://al-rahmaacademy.com/it/resources/faq",
      "x-default=https://al-rahmaacademy.com/resources/faq"
    ]
  },
  "it/tools/tajweed-checker": {
    "title": "Verificatore di Tajweed con IA | AL-Rahma Academy",
    "h1": "Verificatore di Tajweed",
    "canonical": "https://al-rahmaacademy.com/it/tools/tajweed-checker",
    "hreflang": [
      "it=https://al-rahmaacademy.com/it/tools/tajweed-checker",
      "en=https://al-rahmaacademy.com/tools/tajweed-checker",
      "ar=https://al-rahmaacademy.com/ar/tools/tajweed-checker",
      "fr=https://al-rahmaacademy.com/fr/tools/tajweed-checker",
      "x-default=https://al-rahmaacademy.com/tools/tajweed-checker"
    ]
  },
  "it/tools/arabic-alphabet": {
    "title": "Alfabeto arabo | AL-Rahma Academy",
    "h1": "Alfabeto arabo",
    "canonical": "https://al-rahmaacademy.com/it/tools/arabic-alphabet",
    "hreflang": [
      "en=https://al-rahmaacademy.com/tools/arabic-alphabet",
      "ar=https://al-rahmaacademy.com/ar/tools/arabic-alphabet",
      "fr=https://al-rahmaacademy.com/fr/tools/arabic-alphabet",
      "it=https://al-rahmaacademy.com/it/tools/arabic-alphabet",
      "x-default=https://al-rahmaacademy.com/tools/arabic-alphabet"
    ]
  },
  "it/tools/verse-of-the-day": {
    "title": "Versetto del giorno | AL-Rahma Academy",
    "h1": "Versetto del giorno",
    "canonical": "https://al-rahmaacademy.com/it/tools/verse-of-the-day",
    "hreflang": [
      "fr=https://al-rahmaacademy.com/fr/tools/verse-of-the-day",
      "it=https://al-rahmaacademy.com/it/tools/verse-of-the-day",
      "x-default=https://al-rahmaacademy.com/fr/tools/verse-of-the-day"
    ]
  },
  "it/courses/arabic": {
    "title": "Corso di Alfabeto Arabo | AL-Rahma Academy",
    "h1": "Alfabeto arabo e italiano",
    "canonical": "https://al-rahmaacademy.com/it/courses/arabic",
    "hreflang": [
      "en=https://al-rahmaacademy.com/courses/arabic",
      "ar=https://al-rahmaacademy.com/ar/courses/arabic",
      "fr=https://al-rahmaacademy.com/fr/courses/arabic",
      "it=https://al-rahmaacademy.com/it/courses/arabic",
      "x-default=https://al-rahmaacademy.com/courses/arabic"
    ],
    "description": "Impara le 28 lettere arabe con pronuncia audio ed esercizi interattivi — ideale per chi inizia il proprio percorso con il Corano."
  }
};

const FORBIDDEN = /migliore|garantit|garanzia|certificat|accredit|fatwa|infallibil|precis[ioa]|100\s*%|sempre corrett|sostituisc|al posto del|studenti|paesi|ChatGPT|Gemini|Copilot/i;

beforeEach(() => {
  document.head.querySelectorAll('script[data-seo]').forEach((s) => s.remove());
});
afterEach(() => {
  cleanup();
  delete window.navigator.webdriver;
});

describe('the five new Italian descriptions', () => {
  it('are the exact new values and differ from the old ones', () => {
    for (const r of ROUTES) expect(NEW[r]).not.toBe(OLD[r]);
    expect(IT_META_DESCRIPTIONS.faq).toBe(NEW['/it/resources/faq']);
    expect(IT_META_DESCRIPTIONS.adhkar).toBe(NEW['/it/tools/adhkar']);
  });

  it('are unique and 120-160 characters (code points); all are in the preferred 125-155', () => {
    expect(new Set(Object.values(NEW)).size).toBe(5);
    for (const r of ROUTES) {
      expect(len(NEW[r]), r).toBeGreaterThanOrEqual(120);
      expect(len(NEW[r]), r).toBeLessThanOrEqual(160);
    }
    expect(ROUTES.filter((r) => len(NEW[r]) < 125 || len(NEW[r]) > 155)).toEqual([]);
  });

  it('differ from the EN, FR and AR descriptions of the same pages', () => {
    for (const r of ROUTES) {
      for (const l of ['en', 'fr', 'ar']) {
        const o = BASE[l + r.slice(3)];
        if (o) expect(NEW[r], l + r).not.toBe(o.description);
      }
    }
  });

  it('carry no superlative, guarantee, accreditation, fatwa, accuracy, replacement, audience-size or AI-product claim', () => {
    for (const r of ROUTES) expect(NEW[r], r).not.toMatch(FORBIDDEN);
    expect(NEW['/it/tools/verse-of-the-day']).not.toMatch(/italian/i);
    expect(NEW['/it/tools/verse-of-the-day']).toContain('fonte esterna');
  });

  it('the Arabic Alphabet tool and the Arabic course no longer share their opening sentence', () => {
    const tool = NEW['/it/tools/arabic-alphabet'];
    expect(tool).not.toBe(COURSE_ARABIC_IT);
    expect(tool.slice(0, 40)).not.toBe(COURSE_ARABIC_IT.slice(0, 40));
    expect(tool).toMatch(/^Strumento interattivo/);
    expect(BASE['it/courses/arabic'].description).toBe(COURSE_ARABIC_IT);
  });

  it('pickItMetaDescription is Italian-only; every other language keeps its fallback', () => {
    expect(pickItMetaDescription('faq', 'it', 'X')).toBe(NEW['/it/resources/faq']);
    expect(pickItMetaDescription('adhkar', 'it', 'X')).toBe(NEW['/it/tools/adhkar']);
    for (const l of ['en', 'ar', 'fr', 'es', 'de']) {
      expect(pickItMetaDescription('faq', l, 'F')).toBe('F');
      expect(pickItMetaDescription('adhkar', l, 'A')).toBe('A');
    }
  });
});

describe('rendered head: description equals og:description, title and H1 unchanged', () => {
  for (const r of ROUTES) {
    it(r, async () => {
      window.navigator.webdriver = true;
      await mountFullPage(r, PAGES[r]);
      const d = document.querySelector('meta[name="description"]').getAttribute('content');
      expect(d).toBe(NEW[r]);
      expect(document.querySelector('meta[property="og:description"]').getAttribute('content')).toBe(d);
      expect(document.title).toBe(BASE[r.slice(1)].title);
      expect([...document.querySelectorAll('h1')].map((h) => h.textContent.trim())).toEqual([BASE[r.slice(1)].h1]);
    });
  }
});

describe('nothing else moved: sitemap, manifest, llms.txt and robots.txt', () => {
  const file = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
  it('sitemap.xml, robots.txt and the manifest hash to origin/main; 134 pages stay published', () => {
    expect(sha(file('public', 'sitemap.xml'))).toBe('e4de2e4d08cfe7c5ee11d8ee28eb4768ae4f079a57b89b1ef6e28d55e4ebdf9d');
    expect(sha(file('public', 'robots.txt'))).toBe('b2bd76ccef97000cdc5d352d2503b101be782545e8168bd8ed35c4d2fa74e8d4');
    expect(sha(file('scripts', 'prerender-routes.mjs'))).toBe('662229f26e0282460e6463db0758175f09e4783b5c8c2e9ff0fa21614e3ec70c');
    expect(PRERENDER_MANIFEST.filter((e) => e.status === 'published')).toHaveLength(134);
  });
  it('llms.txt hashes to origin/main', () => {
    expect(sha(file('public', 'llms.txt'))).toBe('b801d49380a0e5e6694f497e013c38096d47fd33a3de4ec95305136c21ebdd02');
  });
});

const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const raw = (rel) => fs.readFileSync(path.join(DIST, rel, 'index.html'), 'utf8');
const metaOf = (h, re) => { const m = h.match(re); return m ? decode(m[1]) : null; };
const hreflangOf = (h) => [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[1] + '=' + m[2]);

describe.skipIf(!distExists)('raw prerender HTML (dist/public), before any JavaScript', () => {
  it.each(ROUTES)('%s: new description once, og/twitter equal, title/H1/canonical/hreflang as on origin/main', (r) => {
    const h = raw(r.slice(1));
    const base = BASE[r.slice(1)];
    expect(h).toContain('lang="it"');
    expect(h.split('name="description"')).toHaveLength(2);
    expect(metaOf(h, /<meta name="description" content="([^"]*)"/)).toBe(NEW[r]);
    expect(metaOf(h, /property="og:description" content="([^"]*)"/)).toBe(NEW[r]);
    expect(metaOf(h, /name="twitter:description" content="([^"]*)"/)).toBe(NEW[r]);
    expect(metaOf(h, /<title>([^<]*)/)).toBe(base.title);
    expect(metaOf(h, /<h1[^>]*>([^<]*)/)).toBe(base.h1);
    expect(metaOf(h, /rel="canonical" href="([^"]*)"/)).toBe(base.canonical);
    expect(h).toMatch(/<meta name="robots" content="index, follow[,"]/);
    expect(hreflangOf(h)).toEqual(base.hreflang);
  });

  it('/it/courses/arabic is untouched', () => {
    expect(metaOf(raw('it/courses/arabic'), /<meta name="description" content="([^"]*)"/)).toBe(COURSE_ARABIC_IT);
  });

  it.each(Object.keys(BASE).filter((k) => !k.startsWith('it/')))('%s (en/ar/fr): description, title, H1, canonical and hreflang unchanged', (k) => {
    const h = raw(k.startsWith('en/') ? k.slice(3) : k);
    const base = BASE[k];
    expect(metaOf(h, /<meta name="description" content="([^"]*)"/)).toBe(base.description);
    expect(metaOf(h, /property="og:description" content="([^"]*)"/)).toBe(base.description);
    expect(metaOf(h, /<title>([^<]*)/)).toBe(base.title);
    expect(metaOf(h, /<h1[^>]*>([^<]*)/)).toBe(base.h1);
    expect(metaOf(h, /rel="canonical" href="([^"]*)"/)).toBe(base.canonical);
    expect(hreflangOf(h)).toEqual(base.hreflang);
  });
});
