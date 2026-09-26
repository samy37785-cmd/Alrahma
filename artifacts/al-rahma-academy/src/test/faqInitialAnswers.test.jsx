import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import FAQ from '../pages/FAQ';
import faqItems from '../data/faqItems';

// FAQ initial-render content (2026-09-26): FAQ.jsx previously only mounted
// an answer's <div className="faq-item__a"> when that question was the
// open one (`{open === i && (...)}`), so every closed answer's text was
// entirely absent from the initial DOM — not merely visually hidden. This
// renders the real FAQ page (not a source-text/regex check) and inspects
// the actual DOM to prove every visible question's answer text is present
// from first render, that the accordion's default closed state is
// unchanged, and that toggling a question open/closed never removes its
// answer from the DOM (only its `hidden` attribute changes).
const VISIBLE = 8;

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <FAQ />
      </LangProvider>
    </BrowserRouter>,
  );
}

function expectedAnswers(lang) {
  return faqItems.slice(0, VISIBLE).map((item) => (item[lang] || item.en).a);
}

function answerPanels(container) {
  return [...container.querySelectorAll('.faq-item__a')];
}

describe('FAQ — answers present in initial DOM', () => {
  afterEach(cleanup);

  const locales = [
    { name: 'EN', path: '/resources/faq', lang: 'en' },
    { name: 'AR', path: '/ar/resources/faq', lang: 'ar' },
  ];

  for (const { name, path, lang } of locales) {
    it(`${name}: every visible question's real answer text is in the DOM before any click`, () => {
      const { container } = renderHarness(path);
      const panels = answerPanels(container);
      expect(panels).toHaveLength(VISIBLE);

      const expected = expectedAnswers(lang);
      const actual = panels.map((p) => p.textContent.trim());
      expect(actual).toEqual(expected);
    });

    it(`${name}: initial accordion state is unchanged — nothing open, every answer panel hidden`, () => {
      const { container } = renderHarness(path);
      expect(container.querySelectorAll('.faq-item--open')).toHaveLength(0);

      const buttons = [...container.querySelectorAll('.faq-item__q')];
      for (const btn of buttons) {
        expect(btn.getAttribute('aria-expanded')).toBe('false');
      }

      const panels = answerPanels(container);
      for (const panel of panels) {
        expect(panel.hidden).toBe(true);
      }
    });

    it(`${name}: opening then closing a question never removes its answer from the DOM`, () => {
      const { container } = renderHarness(path);
      const firstButton = container.querySelector('.faq-item__q');
      const firstAnswerText = answerPanels(container)[0].textContent.trim();

      fireEvent.click(firstButton);
      let panels = answerPanels(container);
      expect(panels).toHaveLength(VISIBLE);
      expect(firstButton.getAttribute('aria-expanded')).toBe('true');
      expect(panels[0].hidden).toBe(false);
      expect(panels[0].textContent.trim()).toBe(firstAnswerText);

      fireEvent.click(firstButton);
      panels = answerPanels(container);
      expect(panels).toHaveLength(VISIBLE);
      expect(firstButton.getAttribute('aria-expanded')).toBe('false');
      expect(panels[0].hidden).toBe(true);
      expect(panels[0].textContent.trim()).toBe(firstAnswerText);
    });
  }
});
