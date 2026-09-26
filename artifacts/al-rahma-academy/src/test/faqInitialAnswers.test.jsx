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
//
// FAQ full-content prerender (2026-09-26): an independent review of PR
// #115 found FAQ.jsx also sliced `items` down to the first VISIBLE (8)
// before ever mapping them into JSX (`items.slice(0, VISIBLE)`), so
// questions 9-18 (faqItems.js has 18 total) never entered the DOM at all,
// not even hidden, until "Show all" was clicked — the prerendered/raw HTML
// a crawler sees only ever contained 8 of the 18 real FAQ entries. This
// file's tests were updated alongside the fix: every one of the 18 items
// is now always mapped into the DOM, with items 9-18's whole `.faq-item`
// row (not just its answer) hidden via the same standard `hidden`
// attribute mechanism, tied to `showAll`, until the visitor clicks "Show
// all" — which reveals the existing rows already in the DOM rather than
// mounting new ones.
const VISIBLE = 8;
const TOTAL = faqItems.length;

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
  return faqItems.map((item) => (item[lang] || item.en).a);
}

function answerPanels(container) {
  return [...container.querySelectorAll('.faq-item__a')];
}

function questionRows(container) {
  return [...container.querySelectorAll('.faq-item')];
}

function showAllButton(container) {
  return container.querySelector('.faq-more button');
}

describe('FAQ — all 18 questions/answers present in initial DOM', () => {
  afterEach(cleanup);

  const locales = [
    { name: 'EN', path: '/resources/faq', lang: 'en' },
    { name: 'AR', path: '/ar/resources/faq', lang: 'ar' },
  ];

  for (const { name, path, lang } of locales) {
    it(`${name}: every one of the ${TOTAL} real answers is in the DOM before any click, not just the first ${VISIBLE}`, () => {
      const { container } = renderHarness(path);
      const panels = answerPanels(container);
      expect(panels).toHaveLength(TOTAL);

      const expected = expectedAnswers(lang);
      const actual = panels.map((p) => p.textContent.trim());
      expect(actual).toEqual(expected);
    });

    it(`${name}: initial state — nothing open, every answer hidden, only the first ${VISIBLE} question rows visible`, () => {
      const { container } = renderHarness(path);
      expect(container.querySelectorAll('.faq-item--open')).toHaveLength(0);

      const rows = questionRows(container);
      expect(rows).toHaveLength(TOTAL);
      rows.forEach((row, i) => {
        expect(row.hidden, `row ${i} hidden state before "Show all"`).toBe(i >= VISIBLE);
      });

      const buttons = [...container.querySelectorAll('.faq-item__q')];
      for (const btn of buttons) {
        expect(btn.getAttribute('aria-expanded')).toBe('false');
      }

      const panels = answerPanels(container);
      for (const panel of panels) {
        expect(panel.hidden).toBe(true);
      }
    });

    it(`${name}: opening then closing a visible question never removes its answer from the DOM`, () => {
      const { container } = renderHarness(path);
      const firstButton = container.querySelector('.faq-item__q');
      const firstAnswerText = answerPanels(container)[0].textContent.trim();

      fireEvent.click(firstButton);
      let panels = answerPanels(container);
      expect(panels).toHaveLength(TOTAL);
      expect(firstButton.getAttribute('aria-expanded')).toBe('true');
      expect(panels[0].hidden).toBe(false);
      expect(panels[0].textContent.trim()).toBe(firstAnswerText);

      fireEvent.click(firstButton);
      panels = answerPanels(container);
      expect(panels).toHaveLength(TOTAL);
      expect(firstButton.getAttribute('aria-expanded')).toBe('false');
      expect(panels[0].hidden).toBe(true);
      expect(panels[0].textContent.trim()).toBe(firstAnswerText);
    });

    it(`${name}: "Show all" reveals the ${TOTAL - VISIBLE} remaining rows already in the DOM, without unmounting/remounting anything`, () => {
      const { container } = renderHarness(path);
      const rowsBefore = questionRows(container);
      expect(rowsBefore).toHaveLength(TOTAL);

      const btn = showAllButton(container);
      expect(btn, 'a "Show all" toggle must exist').toBeTruthy();
      expect(btn.getAttribute('aria-expanded')).toBe('false');

      fireEvent.click(btn);

      const rowsAfter = questionRows(container);
      expect(rowsAfter).toHaveLength(TOTAL);
      rowsAfter.forEach((row, i) => {
        expect(row.hidden, `row ${i} hidden state after "Show all"`).toBe(false);
        // Same DOM node identity, not a fresh mount — proves the rows were
        // already there, only their visibility changed.
        expect(row).toBe(rowsBefore[i]);
      });
      expect(btn.getAttribute('aria-expanded')).toBe('true');

      // Every answer is still present and still hidden (no question is open
      // by default even after "Show all" reveals its row).
      const panels = answerPanels(container);
      expect(panels).toHaveLength(TOTAL);
      for (const panel of panels) {
        expect(panel.hidden).toBe(true);
      }
    });
  }
});
