import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LangProvider } from '../context/LangContext';
import { KbdSidePanel } from '../components/features/quran/QuranControls';
import { KBD_SIDE_PANEL_TEXT, pickKbdSidePanel } from '../i18n/quran/kbdSidePanel';
import { FR_META_DESCRIPTIONS, pickFrMetaDescription } from '../i18n/frMetaDescriptions';
import { HOME_SEO_TEXT } from '../i18n/home/seo';
import { ADHKAR_TR } from '../i18n/adhkarText';
import fr from '../i18n/fr';
import en from '../i18n/en';

// French P2 content & metadata fix. Covers:
//  1. /fr/tools/quran-reader keyboard-shortcuts SIDE panel: it hardcoded
//     Arabic UI text for every language; French now has its own French
//     strings, and en/ar/it keep rendering the exact original Arabic.
//  2. Meta descriptions for /fr/, /fr/tools/adhkar, /fr/resources/faq:
//     120-160 characters, French-only, and present in the raw prerender
//     HTML (when a build exists).
//  3. No protected Adhkar religious text and no visible subtitle changed.

const ARABIC_RE = /[؀-ۿ]/;
const ORIGINAL_ARABIC_SIDE_PANEL = {
  tab: 'مفاتيح',
  title: '⌨ اختصارات لوحة المفاتيح',
  close: 'إغلاق ✕',
  labels: [
    'تشغيل / إيقاف',
    'سورة سابقة / تالية',
    'حجم الخط',
    'إظهار / إخفاء الترجمة',
    'الوضع الليلي',
    'الإعدادات',
    'كل الاختصارات',
    'طباعة',
    'إغلاق / إيقاف',
  ],
  keys: ['Space', '← →', '+ / −', 'T', 'D', 'G', '?', 'P', 'Esc'],
};

function renderAt(pathname) {
  window.history.replaceState({}, '', pathname);
  return render(
    <LangProvider>
      <KbdSidePanel open onToggle={() => {}} />
    </LangProvider>,
  );
}

afterEach(cleanup);

describe('Quran Reader keyboard-shortcuts side panel', () => {
  it('/fr renders only French strings (no Arabic UI text) and is left-to-right', () => {
    const { container } = renderAt('/fr/tools/quran-reader');
    expect(ARABIC_RE.test(container.textContent)).toBe(false);
    expect(container.querySelector('.qlc__ksp-tab-text').textContent).toBe('Touches');
    expect(container.querySelector('.qlc__ksp-title').textContent).toBe('⌨ Raccourcis clavier');
    expect(container.querySelector('.qlc__ksp-close').textContent).toBe('Fermer ✕');
    expect(container.querySelector('.qlc__ksp-body').getAttribute('dir')).toBe('ltr');
    const labels = [...container.querySelectorAll('.qlc__ksp-label')].map((e) => e.textContent);
    expect(labels).toEqual(Object.values(KBD_SIDE_PANEL_TEXT.fr.rows));
    expect(labels).toHaveLength(9);
  });

  it('physical key names are identical in every language (never translated)', () => {
    const frKeys = [...renderAt('/fr/tools/quran-reader').container.querySelectorAll('.qlc__kbd')].map((e) => e.textContent);
    cleanup();
    expect(frKeys).toEqual(ORIGINAL_ARABIC_SIDE_PANEL.keys);
    expect(Object.keys(KBD_SIDE_PANEL_TEXT.ar.rows)).toEqual(ORIGINAL_ARABIC_SIDE_PANEL.keys);
    expect(Object.keys(KBD_SIDE_PANEL_TEXT.fr.rows)).toEqual(ORIGINAL_ARABIC_SIDE_PANEL.keys);
  });

  it.each([
    ['/tools/quran-reader', 'en'],
    ['/ar/tools/quran-reader', 'ar'],
    ['/es/tools/quran-reader', 'es'],
  ])('%s (%s) still renders the exact original Arabic panel, rtl', (pathname) => {
    const { container } = renderAt(pathname);
    expect(container.querySelector('.qlc__ksp-tab-text').textContent).toBe(ORIGINAL_ARABIC_SIDE_PANEL.tab);
    expect(container.querySelector('.qlc__ksp-title').textContent).toBe(ORIGINAL_ARABIC_SIDE_PANEL.title);
    expect(container.querySelector('.qlc__ksp-close').textContent).toBe(ORIGINAL_ARABIC_SIDE_PANEL.close);
    expect(container.querySelector('.qlc__ksp-body').getAttribute('dir')).toBe('rtl');
    expect([...container.querySelectorAll('.qlc__ksp-label')].map((e) => e.textContent)).toEqual(ORIGINAL_ARABIC_SIDE_PANEL.labels);
    expect([...container.querySelectorAll('.qlc__kbd')].map((e) => e.textContent)).toEqual(ORIGINAL_ARABIC_SIDE_PANEL.keys);
  });

  it('only French selects the French strings (Italian selects its own)', () => {
    expect(pickKbdSidePanel('fr')).toBe(KBD_SIDE_PANEL_TEXT.fr);
    for (const l of ['en', 'ar', 'es', 'de']) expect(pickKbdSidePanel(l)).toBe(KBD_SIDE_PANEL_TEXT.ar);
    expect(pickKbdSidePanel('it')).toBe(KBD_SIDE_PANEL_TEXT.it); // Italian has its own panel (italianQuranReaderContent.test.jsx)
  });
});

describe('French meta descriptions', () => {
  const descriptions = {
    home: HOME_SEO_TEXT.fr.description,
    adhkar: FR_META_DESCRIPTIONS.adhkar,
    faq: FR_META_DESCRIPTIONS.faq,
  };

  it.each(Object.entries(descriptions))('%s is 120-160 characters', (_k, d) => {
    const n = [...d].length;
    expect(n).toBeGreaterThanOrEqual(120);
    expect(n).toBeLessThanOrEqual(160);
  });

  it('home description keeps its claims: 1:1 lessons, Al-Azhar teachers, free trial, no payment', () => {
    const d = HOME_SEO_TEXT.fr.description;
    expect(d).toContain('Al-Azhar');
    expect(d).toContain("leçon d'essai gratuite");
    expect(d).toContain('sans paiement');
  });

  it('non-French languages keep the page string (en/ar/it/es/de metadata untouched)', () => {
    expect(pickFrMetaDescription('faq', 'en', fr.faqPg.sub)).toBe(fr.faqPg.sub);
    for (const l of ['en', 'ar', 'it', 'es', 'de']) {
      expect(pickFrMetaDescription('adhkar', l, 'X')).toBe('X');
      expect(pickFrMetaDescription('faq', l, 'Y')).toBe('Y');
    }
    expect(pickFrMetaDescription('adhkar', 'fr', 'X')).toBe(FR_META_DESCRIPTIONS.adhkar);
    expect(pickFrMetaDescription('faq', 'fr', 'Y')).toBe(FR_META_DESCRIPTIONS.faq);
  });

  it('en/ar/it Home descriptions are unchanged', () => {
    expect(HOME_SEO_TEXT.en.description).toMatch(/^One-to-one online Quran, Tajweed and Arabic lessons with Al-Azhar certified tutors, trusted by /);
    expect(HOME_SEO_TEXT.en.description).toMatch(/One free trial lesson — no payment needed\.$/);
    expect(HOME_SEO_TEXT.ar.description).toMatch(/^دروس فردية مباشرة أونلاين/);
    // it was shortened later by the Italian long-description wave (italianMetadataLongPages.test.jsx).
    expect(HOME_SEO_TEXT.it.description).toMatch(/^Lezioni individuali online di Corano, Tajweed, arabo/);
  });

  it('the visible French subtitles are unchanged (only <head> metadata moved)', () => {
    expect(fr.faqPg.sub).toBe('Tout ce que vous devez savoir sur Al-Rahma Academy et nos cours en ligne du Coran.');
    expect(fr.adhkar.sub).toBe('Adhkar quotidiens avec vocalisation complète, mérites et sources');
  });

  it('titles are untouched', () => {
    expect(HOME_SEO_TEXT.fr.title).toBe('Apprendre le Coran en ligne');
    expect(fr.faqPg.heading).toBe('Questions fréquentes');
    expect(fr.adhkar.heading).toBe('Bibliothèque d’adhkar et de duʿa');
  });
});

describe('Adhkar religious source text is untouched', () => {
  it('every one of the 49 entries still has fr.meaning/fr.fadl identical to the English source text', () => {
    const ids = Object.keys(ADHKAR_TR);
    expect(ids).toHaveLength(49);
    for (const id of ids) {
      expect(ADHKAR_TR[id].fr.meaning).toBe(ADHKAR_TR[id].en.meaning);
      expect(ADHKAR_TR[id].fr.fadl).toBe(ADHKAR_TR[id].en.fadl);
    }
  });
});

describe('/fr/courses/arabic heading is intentionally NOT changed by this fix', () => {
  it('EN/FR still carry the existing wording pending an owner decision', () => {
    expect(en.hubs.arabic.heading).toBe('Arabic & Italian Alphabet');
    expect(fr.hubs.arabic.heading).toBe('Alphabet arabe et italien');
  });
});

// ── raw prerender HTML (only meaningful after a real build) ──────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist/public');
const distExists = existsSync(distDir);

function rawDescription(rel) {
  const html = readFileSync(path.join(distDir, rel), 'utf8');
  const m = html.match(/<meta name="description" content="([^"]*)"/);
  const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  return { html, description: m ? decode(m[1]) : null };
}

describe.skipIf(!distExists)('French P2 metadata in raw prerender HTML (dist/public) — before any JavaScript', () => {
  it.each([
    ['fr/index.html', () => HOME_SEO_TEXT.fr.description],
    ['fr/tools/adhkar/index.html', () => FR_META_DESCRIPTIONS.adhkar],
    ['fr/resources/faq/index.html', () => FR_META_DESCRIPTIONS.faq],
  ])('%s carries the new French meta description (and og/twitter copies)', (rel, expected) => {
    const { html, description } = rawDescription(rel);
    expect(description).toBe(expected());
    const n = [...description].length;
    expect(n).toBeGreaterThanOrEqual(120);
    expect(n).toBeLessThanOrEqual(160);
    expect(html).toContain('lang="fr"');
    expect(html).toMatch(/<meta property="og:description" content="[^"]+"/);
  });
});
