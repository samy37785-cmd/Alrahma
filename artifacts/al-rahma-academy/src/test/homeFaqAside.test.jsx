import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { siteFacts } from '../data/siteFacts';
import FAQ from '../components/features/marketing/FAQ';

// Teacher / Contact Truth Final Corrective (2026-09-02): the LIVE homepage
// marketing FAQ component (imported by pages/Home.jsx, rendered inside a
// DeferredSection on "/") had a separate, unapproved WhatsApp deep-link
// (wa.me/message/ALRAHMA) and three hardcoded English-only aside strings
// that leaked into every locale. The earlier round's tests never caught
// this because they only exercised pages/FAQ.jsx (the standalone
// /resources/faq page) — a different component under a similarly-named
// file. This file renders the REAL component actually shown on the
// homepage, not a proxy for it.

const LOCALES = ['en', 'ar', 'it', 'es', 'de', 'fr'];
const LOCALE_PATH = { en: '/', ar: '/ar', it: '/it', es: '/es', de: '/de', fr: '/fr' };

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

describe('Home marketing FAQ.jsx — WhatsApp aside (Teacher/Contact Truth Final Corrective)', () => {
  it('renders a WhatsApp button pointing at the real official number, not the old wa.me/message/ALRAHMA deep-link', () => {
    renderWithLang(<FAQ />);
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute('href', 'https://wa.me/201039553264');
    expect(link.getAttribute('href')).not.toMatch(/wa\.me\/message/);
  });

  it('the WhatsApp button has target="_blank" and rel="noopener noreferrer"', () => {
    renderWithLang(<FAQ />);
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('accordion behavior is unchanged: clicking a question toggles its answer', () => {
    renderWithLang(<FAQ />);
    const buttons = screen.getAllByRole('button');
    const firstQuestion = buttons.find((b) => b.className.includes('faq__question'));
    expect(firstQuestion).toBeTruthy();
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(firstQuestion);
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
  });

  it.each(LOCALES)('renders no literal "undefined" in %s', (lang) => {
    const { container } = renderWithLang(<FAQ />, LOCALE_PATH[lang]);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  // Teacher/Contact Final Corrective R2 (2026-09-02): the R1 version of this
  // file only proved non-empty text and the absence of a few English
  // literals in non-English locales — it never proved the actual approved
  // wording rendered correctly in any locale but en/ar. This exact map
  // is the owner-approved text for all six languages; every value below
  // must render byte-for-byte, not just "be present" or "not be English."
  const EXPECTED_ASIDE = {
    en: {
      title: 'Still have questions?',
      text: 'Our team aims to reply within 24 hours. Ask us anything before you commit.',
      button: 'Chat with us on WhatsApp',
    },
    ar: {
      title: 'هل لا تزال لديك أسئلة؟',
      text: 'نسعى للرد خلال 24 ساعة. اسألنا عن أي شيء قبل اتخاذ قرارك.',
      button: 'تحدث معنا عبر واتساب',
    },
    it: {
      title: 'Hai ancora domande?',
      text: 'Il nostro team punta a rispondere entro 24 ore. Chiedici tutto prima di impegnarti.',
      button: 'Scrivici su WhatsApp',
    },
    es: {
      title: '¿Sigues teniendo preguntas?',
      text: 'Nuestro equipo procura responder en un plazo de 24 horas. Pregúntanos lo que necesites antes de decidirte.',
      button: 'Chatea con nosotros por WhatsApp',
    },
    de: {
      title: 'Hast du noch Fragen?',
      text: 'Unser Team antwortet in der Regel innerhalb von 24 Stunden. Frag uns alles, bevor du dich entscheidest.',
      button: 'Chatte mit uns auf WhatsApp',
    },
    fr: {
      title: 'Vous avez encore des questions ?',
      text: "Notre équipe s'efforce de répondre sous 24 heures. Posez-nous toutes vos questions avant de vous engager.",
      button: 'Discutez avec nous sur WhatsApp',
    },
  };

  it.each(LOCALES)('%s renders the exact approved asideTitle/asideText/asideButton text', (lang) => {
    renderWithLang(<FAQ />, LOCALE_PATH[lang]);
    const aside = document.querySelector('.faq__aside');
    expect(aside, lang).toBeTruthy();
    const expected = EXPECTED_ASIDE[lang];
    expect(aside.querySelector('h3').textContent, `${lang} asideTitle`).toBe(expected.title);
    expect(aside.querySelector('p').textContent, `${lang} asideText`).toBe(expected.text);
    expect(aside.querySelector('a').textContent, `${lang} asideButton`).toBe(expected.button);
  });

  it('every locale\'s asideText contains the current siteFacts.supportResponseHours value, not a value independent of it', () => {
    for (const lang of LOCALES) {
      const { unmount } = renderWithLang(<FAQ />, LOCALE_PATH[lang]);
      const aside = document.querySelector('.faq__aside');
      expect(aside.querySelector('p').textContent, lang).toContain(String(siteFacts.supportResponseHours));
      unmount();
    }
  });

  it('Arabic renders RTL and is not broken', () => {
    renderWithLang(<FAQ />, '/ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    const aside = document.querySelector('.faq__aside');
    expect(aside.querySelector('h3').textContent).toBe(EXPECTED_ASIDE.ar.title);
    expect(aside.querySelector('p').textContent).toBe(EXPECTED_ASIDE.ar.text);
    expect(aside.querySelector('a').textContent).toBe(EXPECTED_ASIDE.ar.button);
  });
});

describe('faq.asideTitle/asideText/asideButton source-level contract (i18n files build at import time)', () => {
  // Locale objects are built once, at module-import time, from a `const
  // cmp = planComparison()`-style top-level computation — they do not
  // re-evaluate if siteFacts.supportResponseHours is mutated afterwards in
  // the same test process. Mutating it here and re-asserting would just
  // prove the *already-computed* string didn't change, which is not a
  // meaningful test of the wiring. Instead: assert the six locale files'
  // SOURCE actually references siteFacts.supportResponseHours (so the
  // build-time value is genuinely derived, not a copy-pasted literal), and
  // assert the current computed value is correct — the render tests above
  // already do the latter for en/ar.
  it('every locale file computes faq.asideText from siteFacts.supportResponseHours in source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    for (const lang of LOCALES) {
      const src = fs.readFileSync(path.resolve(__dirname, `../i18n/${lang}.js`), 'utf8');
      const asideTextLine = src.split('\n').find((l) => l.includes('"asideText"'));
      expect(asideTextLine, `${lang}.js asideText`).toBeTruthy();
      expect(asideTextLine, `${lang}.js asideText`).toMatch(/siteFacts\.supportResponseHours/);
      expect(asideTextLine, `${lang}.js asideText should not hardcode a new literal 24`).not.toMatch(/[^0-9]24[^0-9]/);
    }
  });
});
