import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { cleanup } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Home from '../pages/Home';
import AboutPage from '../pages/About';
import Enroll from '../pages/Enroll';
import Teachers from '../pages/Teachers';
import { PRERENDER_MANIFEST } from '../../scripts/prerender-routes.mjs';

// Italian SEO Meta Descriptions, long wave: the <meta name="description"> (and its og:/twitter:
// copies) of /it/, /it/academy/about, /it/enroll and /it/academy/teachers were 194-282 code
// points long. Each is now 125-155. The 120-160 range is scoped to these four pages only.
// Length = Unicode code points ([...s].length), as in italianMetadataShortPages.test.jsx.
// Nothing visible changes: About's paragraph (t.about.description) keeps its text, and the
// three other strings were head-only.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist/public');
const distExists = fs.existsSync(DIST);
useFullPageEnvironment();

const sha = (s) => createHash('sha256').update(s).digest('hex');
// The Home TrustBar's WhatsApp status (support online / leave a message) follows the Cairo clock at
// build time, so it differs between builds; it is removed before hashing the visible text.
const mainTextHash = (doc) => { const m = doc.querySelector('#main-content').cloneNode(true); m.querySelectorAll('.trust-bar__wa').forEach((e) => e.remove()); return sha(m.textContent); };
const len = (s) => [...s].length;

const NEW = {
  '/it/': 'Lezioni individuali online di Corano, Tajweed, arabo e studi islamici con insegnanti certificati di Al-Azhar. Una lezione di prova gratuita, senza carta.',
  '/it/academy/about': 'Chi è Al-Rahma Academy: missione, visione, valori e storia di una piattaforma di lezioni individuali online di Corano e arabo per bambini e adulti.',
  '/it/enroll': "Richiedi una lezione di prova gratuita di Corano in 4 passi: i tuoi dati, gli obiettivi, l'insegnante e il piano. Il nostro team ti contatterà su WhatsApp.",
  '/it/academy/teachers': 'Sfoglia i profili degli insegnanti di Al-Rahma Academy e filtra per materia, genere e lingua per scegliere chi seguirà le tue lezioni di Corano e arabo.',
};
const PAGES = { '/it/': Home, '/it/academy/about': AboutPage, '/it/enroll': Enroll, '/it/academy/teachers': Teachers };
const ROUTES = Object.keys(NEW);
const keyOf = (r) => r.slice(1).replace(/^it\/$/, 'it/'); // '/it/' -> 'it/', '/it/enroll' -> 'it/enroll'

// origin/main (165b9be) production raw-prerender facts, captured twice and identical.
// mainText = SHA-256 of #main-content's textContent in the raw HTML.
const BASE = {
  "en/": {
    "title": "Learn the Quran Online | AL-Rahma Academy",
    "h1": [
      "Give Your Child the Gift of the Quran"
    ],
    "canonical": "https://al-rahmaacademy.com/",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "en_GB",
    "hreflang": [
      "en=https://al-rahmaacademy.com/",
      "ar=https://al-rahmaacademy.com/ar/",
      "fr=https://al-rahmaacademy.com/fr/",
      "it=https://al-rahmaacademy.com/it/",
      "x-default=https://al-rahmaacademy.com/"
    ],
    "description": "One-to-one online Quran, Tajweed and Arabic lessons with Al-Azhar certified tutors, trusted by 1,500+ students in 10 countries. One free trial lesson — no payment needed.",
    "mainText": "ae19ef9799b3c2653edc85bf0c962c156686738cdb3b4c30ebec3be690d0d526"
  },
  "en/academy/about": {
    "title": "About us | AL-Rahma Academy",
    "h1": [
      "About Al-Rahma Academy"
    ],
    "canonical": "https://al-rahmaacademy.com/academy/about",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "en_GB",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/about",
      "ar=https://al-rahmaacademy.com/ar/academy/about",
      "fr=https://al-rahmaacademy.com/fr/academy/about",
      "it=https://al-rahmaacademy.com/it/academy/about",
      "x-default=https://al-rahmaacademy.com/academy/about"
    ],
    "description": "Al-Rahma Academy is a dedicated online platform connecting students around the world with the Holy Quran and the Arabic language. Our qualified native Egyptian tutors deliver personalised, one-to-one live lessons — for children and adults, from anywhere in the world.",
    "mainText": "7f8620ad248f50d90c38f9b6691aee0a1817b442ae7f122a2ede57d4d7a1503a"
  },
  "en/academy/teachers": {
    "title": "Al-Azhar Certified Quran Tutors | AL-Rahma Academy",
    "h1": [
      "Our Qualified Tutors"
    ],
    "canonical": "https://al-rahmaacademy.com/academy/teachers",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "en_GB",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/teachers",
      "ar=https://al-rahmaacademy.com/ar/academy/teachers",
      "fr=https://al-rahmaacademy.com/fr/academy/teachers",
      "it=https://al-rahmaacademy.com/it/academy/teachers",
      "x-default=https://al-rahmaacademy.com/academy/teachers"
    ],
    "description": "Al-Rahma Academy has 30 teachers on our team — 11 of them are featured here. Every teacher is an Al-Azhar graduate holding a verified Ijazah with a continuous sanad, with identity verified by the academy.",
    "mainText": "a6c48e11d94c5b86150dd6815f2185a98b3af795f3aae9aaa75f6cc9e9e632bc"
  },
  "ar/": {
    "title": "تعلم القرآن الكريم أونلاين | AL-Rahma Academy",
    "h1": [
      "امنح طفلك هدية القرآن الكريم"
    ],
    "canonical": "https://al-rahmaacademy.com/ar/",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "ar_EG",
    "hreflang": [
      "en=https://al-rahmaacademy.com/",
      "ar=https://al-rahmaacademy.com/ar/",
      "fr=https://al-rahmaacademy.com/fr/",
      "it=https://al-rahmaacademy.com/it/",
      "x-default=https://al-rahmaacademy.com/"
    ],
    "description": "دروس فردية مباشرة أونلاين في القرآن الكريم والتجويد واللغة العربية مع معلمين معتمدين من الأزهر، موثوق بنا من 1,500+ طالب في 10 دولة. حصة تجريبية مجانية واحدة — بدون أي دفع.",
    "mainText": "dcc1c54ae92b83d3cf013c8b835fc97e0500164c7afe5e822aa1404efb74dfbd"
  },
  "ar/academy/about": {
    "title": "من نحن | AL-Rahma Academy",
    "h1": [
      "من نحن"
    ],
    "canonical": "https://al-rahmaacademy.com/ar/academy/about",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "ar_EG",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/about",
      "ar=https://al-rahmaacademy.com/ar/academy/about",
      "fr=https://al-rahmaacademy.com/fr/academy/about",
      "it=https://al-rahmaacademy.com/it/academy/about",
      "x-default=https://al-rahmaacademy.com/academy/about"
    ],
    "description": "أكاديمية الرحمة منصة تعليمية متخصصة تربط الطلاب في جميع أنحاء العالم بالقرآن الكريم واللغة العربية. يقدم معلمونا المصريون المؤهلون حصصاً فردية مباشرة — للأطفال والكبار، من أي مكان في العالم.",
    "mainText": "01e05fa67b6047d39f7570450762c9f403683da49a9f86c494c3f7c6a8b5f6a2"
  },
  "ar/academy/teachers": {
    "title": "معلمونا المعتمدون من الأزهر | AL-Rahma Academy",
    "h1": [
      "معلمونا المؤهلون"
    ],
    "canonical": "https://al-rahmaacademy.com/ar/academy/teachers",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "ar_EG",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/teachers",
      "ar=https://al-rahmaacademy.com/ar/academy/teachers",
      "fr=https://al-rahmaacademy.com/fr/academy/teachers",
      "it=https://al-rahmaacademy.com/it/academy/teachers",
      "x-default=https://al-rahmaacademy.com/academy/teachers"
    ],
    "description": "تضم أكاديمية الرحمة 30 معلمًا، 11 منهم معروضون هنا. كل معلم خريج الأزهر ويحمل إجازة بسند متصل، وهويته موثقة لدى الأكاديمية.",
    "mainText": "cd479cb285c07a270d483c837c2753e4a1ea6ead1dfaf8ad8eeccd65f7ee7c74"
  },
  "fr/": {
    "title": "Apprendre le Coran en ligne | AL-Rahma Academy",
    "h1": [
      "Offrez à votre enfant le cadeau du Coran"
    ],
    "canonical": "https://al-rahmaacademy.com/fr/",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "fr_FR",
    "hreflang": [
      "en=https://al-rahmaacademy.com/",
      "ar=https://al-rahmaacademy.com/ar/",
      "fr=https://al-rahmaacademy.com/fr/",
      "it=https://al-rahmaacademy.com/it/",
      "x-default=https://al-rahmaacademy.com/"
    ],
    "description": "Cours particuliers de Coran, de tajwid et d'arabe en ligne avec des enseignants certifiés Al-Azhar. Une leçon d'essai gratuite, sans paiement.",
    "mainText": "03663f247eab8f3ef053524e4c25b1a291867fba3b5e23ae7ed3ddaae205a063"
  },
  "fr/academy/about": {
    "title": "À propos | AL-Rahma Academy",
    "h1": [
      "À propos d'Al-Rahma Academy"
    ],
    "canonical": "https://al-rahmaacademy.com/fr/academy/about",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "fr_FR",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/about",
      "ar=https://al-rahmaacademy.com/ar/academy/about",
      "fr=https://al-rahmaacademy.com/fr/academy/about",
      "it=https://al-rahmaacademy.com/it/academy/about",
      "x-default=https://al-rahmaacademy.com/academy/about"
    ],
    "description": "Al-Rahma Academy est une plateforme en ligne dédiée qui relie des étudiants du monde entier au Saint Coran et à la langue arabe. Nos enseignants égyptiens, natifs et qualifiés, dispensent des cours particuliers en direct — pour les enfants comme pour les adultes, partout dans le monde.",
    "mainText": "0226d7595e4c23272e892c78c6eb925f5459581d877077dee79357e0804349cd"
  },
  "fr/enroll": {
    "title": "Réserver des cours d'essai gratuits | AL-Rahma Academy",
    "h1": [
      "Inscrivez-vous à Al-Rahma Academy"
    ],
    "canonical": "https://al-rahmaacademy.com/fr/enroll",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "fr_FR",
    "hreflang": [
      "fr=https://al-rahmaacademy.com/fr/enroll",
      "it=https://al-rahmaacademy.com/it/enroll",
      "x-default=https://al-rahmaacademy.com/fr/enroll"
    ],
    "description": "Un cours d'essai de Coran individuel et gratuit — sans paiement, sans engagement. Choisissez vos matières, choisissez un enseignant certifié par Al-Azhar et réservez votre formule — nous confirmerons avec vous votre planning et le paiement sur WhatsApp.",
    "mainText": "c1be31b436c3d73a1b05be0495d600a81b9d6d3edd5613dd079ec978447f3327"
  },
  "fr/academy/teachers": {
    "title": "Tuteurs de Coran certifiés Al-Azhar | AL-Rahma Academy",
    "h1": [
      "Nos enseignants qualifiés"
    ],
    "canonical": "https://al-rahmaacademy.com/fr/academy/teachers",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "fr_FR",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/teachers",
      "ar=https://al-rahmaacademy.com/ar/academy/teachers",
      "fr=https://al-rahmaacademy.com/fr/academy/teachers",
      "it=https://al-rahmaacademy.com/it/academy/teachers",
      "x-default=https://al-rahmaacademy.com/academy/teachers"
    ],
    "description": "Al-Rahma Academy compte 30 enseignants dans notre équipe — 11 d'entre eux sont présentés ici. Chaque enseignant est diplômé d'Al-Azhar, titulaire d'une ijaza vérifiée avec un sanad continu, et son identité est vérifiée par l'académie.",
    "mainText": "a97b5fbfb5fb3d0932319b3245f9220ff06a1768ea3ecbb5de36123fdbb75188"
  },
  "it/": {
    "title": "Impara il Corano online | AL-Rahma Academy",
    "h1": [
      "Regala a tuo figlio il Corano"
    ],
    "canonical": "https://al-rahmaacademy.com/it/",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "it_IT",
    "hreflang": [
      "en=https://al-rahmaacademy.com/",
      "ar=https://al-rahmaacademy.com/ar/",
      "fr=https://al-rahmaacademy.com/fr/",
      "it=https://al-rahmaacademy.com/it/",
      "x-default=https://al-rahmaacademy.com/"
    ],
    "description": "Lezioni individuali online di Corano, Tajweed e arabo con insegnanti certificati di Al-Azhar, di cui si fidano 1,500+ studenti in 10 paesi. Una lezione di prova gratuita — senza alcun pagamento.",
    "mainText": "ba001f59f4dd162a530f7872b770fe21c04d21bf7df02323ac1385b48f94f29d"
  },
  "it/academy/about": {
    "title": "Chi siamo | AL-Rahma Academy",
    "h1": [
      "Chi siamo su Al-Rahma Academy"
    ],
    "canonical": "https://al-rahmaacademy.com/it/academy/about",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "it_IT",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/about",
      "ar=https://al-rahmaacademy.com/ar/academy/about",
      "fr=https://al-rahmaacademy.com/fr/academy/about",
      "it=https://al-rahmaacademy.com/it/academy/about",
      "x-default=https://al-rahmaacademy.com/academy/about"
    ],
    "description": "Al-Rahma Academy è una piattaforma online dedicata che mette in contatto studenti di tutto il mondo con il Sacro Corano e la lingua araba. I nostri insegnanti egiziani madrelingua qualificati offrono lezioni individuali dal vivo — per bambini e adulti, da qualsiasi parte del mondo.",
    "mainText": "f58105bdb93dc300c167773dc8f4a57946f2a9676a3b0357920798ba23574f1a"
  },
  "it/enroll": {
    "title": "Prenota lezioni di prova gratuite | AL-Rahma Academy",
    "h1": [
      "Iscriviti ad Al-Rahma Academy"
    ],
    "canonical": "https://al-rahmaacademy.com/it/enroll",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "it_IT",
    "hreflang": [
      "fr=https://al-rahmaacademy.com/fr/enroll",
      "it=https://al-rahmaacademy.com/it/enroll",
      "x-default=https://al-rahmaacademy.com/fr/enroll"
    ],
    "description": "Una lezione di prova gratuita individuale di Corano — senza pagamento, senza impegno. Scegli le tue materie, scegli un insegnante certificato Al-Azhar e prenota il tuo piano — confermeremo con te l'orario e il pagamento su WhatsApp.",
    "mainText": "ce332116a6206ef49917d6e81ba3831f980ea73b8ad7fd5cf521043ab8367283"
  },
  "it/academy/teachers": {
    "title": "Insegnanti di Corano Certificati Al-Azhar | AL-Rahma Academy",
    "h1": [
      "I nostri insegnanti qualificati"
    ],
    "canonical": "https://al-rahmaacademy.com/it/academy/teachers",
    "robots": "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
    "ogLocale": "it_IT",
    "hreflang": [
      "en=https://al-rahmaacademy.com/academy/teachers",
      "ar=https://al-rahmaacademy.com/ar/academy/teachers",
      "fr=https://al-rahmaacademy.com/fr/academy/teachers",
      "it=https://al-rahmaacademy.com/it/academy/teachers",
      "x-default=https://al-rahmaacademy.com/academy/teachers"
    ],
    "description": "Al-Rahma Academy conta 30 insegnanti nel nostro team — 11 di loro sono presentati qui. Ogni insegnante è un laureato di Al-Azhar, titolare di un'Ijazah verificata con sanad continuo, con identità verificata dall'accademia.",
    "mainText": "cbe05d1a5135993cd1378dc9b3c5c69efab8329ad3ff9270413e901805b402e5"
  }
};

// SHA-256 of #main-content's textContent after mounting each Italian page in jsdom, computed
// on the unmodified origin/main tree. Proves the visible copy did not move.
// /it/ updated by the TrustBar deterministic-rendering fix: under navigator.webdriver the
// WhatsApp status now shows the neutral "Scrivici su WhatsApp" + support hours instead of
// "Supporto online…" (that one swap reproduces the previous hash, 44c2be0d…).
const MOUNTED_TEXT = {
  "/it/": "267ce8ad1bd5c6013ae9006dc38b4c80926c668f117b7c058d4bb149ee0ba409",
  "/it/academy/about": "f58105bdb93dc300c167773dc8f4a57946f2a9676a3b0357920798ba23574f1a",
  "/it/enroll": "ce332116a6206ef49917d6e81ba3831f980ea73b8ad7fd5cf521043ab8367283",
  "/it/academy/teachers": "cbe05d1a5135993cd1378dc9b3c5c69efab8329ad3ff9270413e901805b402e5"
};

const FORBIDDEN = /migliore|leader|garantit|garanzia|accreditat|ufficial|\d[\d.,]*\s*\+?\s*(studenti|paesi|insegnanti|lezioni)|valutazion|recensioni|stelle|anni di esperienza|prezz|€|\$|sconto|ChatGPT|Gemini|Copilot|intelligenza artificiale/i;

beforeEach(() => {
  document.head.querySelectorAll('script[data-seo]').forEach((s) => s.remove());
});
afterEach(() => {
  cleanup();
  delete window.navigator.webdriver;
});

describe('the four new Italian descriptions', () => {
  it('are 125-155 code points (inside the hard 120-160 range), unique, and shorter than before', () => {
    expect(new Set(Object.values(NEW)).size).toBe(4);
    for (const r of ROUTES) {
      expect(len(NEW[r]), r).toBeGreaterThanOrEqual(125);
      expect(len(NEW[r]), r).toBeLessThanOrEqual(155);
      expect(len(NEW[r]), r).toBeLessThan(len(BASE[keyOf(r)].description));
    }
  });

  it('differ from every EN, AR and FR description of the same pages', () => {
    const others = Object.entries(BASE).filter(([k]) => !k.startsWith('it/')).map(([, v]) => v.description);
    for (const r of ROUTES) expect(others, r).not.toContain(NEW[r]);
  });

  it('carry no superlative, guarantee, accreditation, count, rating, price or AI-product claim', () => {
    for (const r of ROUTES) expect(NEW[r], r).not.toMatch(FORBIDDEN);
  });
});

describe('wiring: each Italian page puts the new text into description, og:description and twitter:description', () => {
  for (const r of ROUTES) {
    it(r, async () => {
      window.navigator.webdriver = true;
      await mountFullPage(r, PAGES[r]);
      const get = (s) => document.querySelector(s)?.getAttribute('content');
      expect(get('meta[name="description"]')).toBe(NEW[r]);
      expect(get('meta[property="og:description"]')).toBe(NEW[r]);
      expect(get('meta[name="twitter:description"]')).toBe(NEW[r]);
      expect(document.title).toBe(BASE[keyOf(r)].title);
      expect([...document.querySelectorAll('h1')].map((h) => h.textContent.trim())).toEqual(BASE[keyOf(r)].h1);
      expect(sha(document.querySelector('#main-content').textContent)).toBe(MOUNTED_TEXT[r]);
    });
  }

  it('the About paragraph still shows the original t.about.description text', async () => {
    window.navigator.webdriver = true;
    await mountFullPage('/it/academy/about', AboutPage);
    expect(document.querySelector('.about__desc').textContent).toMatch(/^Al-Rahma Academy è una piattaforma online dedicata/);
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).not.toBe(document.querySelector('.about__desc').textContent);
  });

  it('/it/enroll under navigator.webdriver: no request, empty timezone and empty fields', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network disabled in test')));
    vi.stubGlobal('fetch', fetchSpy);
    window.navigator.webdriver = true;
    await mountFullPage('/it/enroll', Enroll);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelector('input.field__readonly').value).toBe('');
    for (const el of document.querySelectorAll('#main-content input:not([type="checkbox"]):not([type="radio"]), #main-content textarea')) {
      expect(el.value, el.className || el.id).toBe('');
    }
  });
});

describe('nothing else moved: sitemap, manifest, robots and llms.txt', () => {
  const file = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
  it('hash to origin/main, and 134 pages stay published', () => {
    expect(sha(file('public', 'sitemap.xml'))).toBe('e4de2e4d08cfe7c5ee11d8ee28eb4768ae4f079a57b89b1ef6e28d55e4ebdf9d');
    expect(sha(file('public', 'robots.txt'))).toBe('b2bd76ccef97000cdc5d352d2503b101be782545e8168bd8ed35c4d2fa74e8d4');
    expect(sha(file('public', 'llms.txt'))).toBe('b801d49380a0e5e6694f497e013c38096d47fd33a3de4ec95305136c21ebdd02');
    expect(sha(file('scripts', 'prerender-routes.mjs'))).toBe('662229f26e0282460e6463db0758175f09e4783b5c8c2e9ff0fa21614e3ec70c');
    expect(PRERENDER_MANIFEST.filter((e) => e.status === 'published')).toHaveLength(134);
  });
});

const raw = (key) => {
  const rel = key.startsWith('en/') ? key.slice(3) : key;
  const html = fs.readFileSync(path.join(DIST, rel, 'index.html'), 'utf8');
  return { html, doc: new JSDOM(html).window.document };
};
const facts = (doc) => {
  const a = (s, k) => doc.querySelector(s)?.getAttribute(k) ?? null;
  return {
    title: doc.title,
    h1: [...doc.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    canonical: a('link[rel="canonical"]', 'href'),
    robots: a('meta[name="robots"]', 'content'),
    ogLocale: a('meta[property="og:locale"]', 'content'),
    hreflang: [...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map((x) => `${x.getAttribute('hreflang')}=${x.getAttribute('href')}`),
    mainText: mainTextHash(doc),
  };
};

describe.skipIf(!distExists)('raw prerender HTML (dist/public), before any JavaScript', () => {
  it.each(ROUTES)('%s: new description once in each of the three tags; everything else as on origin/main', (r) => {
    const { html, doc } = raw(keyOf(r));
    const { description, ...base } = BASE[keyOf(r)];
    expect(html).toContain('<html lang="it" dir="ltr">');
    for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      expect(doc.querySelectorAll(sel), sel).toHaveLength(1);
      expect(doc.querySelector(sel).getAttribute('content'), sel).toBe(NEW[r]);
    }
    expect(description).not.toBe(NEW[r]);
    expect(facts(doc)).toEqual(base);
    expect(doc.querySelectorAll('script[data-seo="breadcrumb"]').length).toBe(r === '/it/' ? 0 : 1);
  });

  it('/it/enroll raw: empty timezone and fields, no zone name and no booking call baked in', () => {
    const { html, doc } = raw('it/enroll');
    expect(doc.querySelector('input.field__readonly').getAttribute('value') ?? '').toBe('');
    for (const el of doc.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]), main textarea')) {
      expect(el.getAttribute('value') ?? '', el.className || el.id).toBe('');
    }
    expect(html).not.toMatch(/Africa\/|Europe\/|America\/[A-Z]|Asia\/[A-Z]|value="UTC"/);
    expect(html).not.toMatch(/api\/v1\/enrollments|Riferimento prenotazione/i);
  });

  it.each(Object.keys(BASE).filter((k) => !k.startsWith('it/')))('%s (en/ar/fr) is byte-for-byte unchanged in its SEO facts and visible text', (k) => {
    const { doc } = raw(k);
    const { description, ...base } = BASE[k];
    expect(doc.querySelector('meta[name="description"]').getAttribute('content')).toBe(description);
    expect(doc.querySelector('meta[property="og:description"]').getAttribute('content')).toBe(description);
    expect(facts(doc)).toEqual(base);
  });
});
