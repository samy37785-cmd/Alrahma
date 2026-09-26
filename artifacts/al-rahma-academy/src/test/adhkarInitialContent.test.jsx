import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { QueryProvider } from '../context/QueryProvider';
import { langFromPath } from '../utils/localePath';
import Adhkar from '../pages/Adhkar';
import { ADHKAR, CATEGORY_KEYS } from '../data/adhkarData';

// Adhkar initial-content completeness (2026-09-26): a read-only discovery
// pass found Adhkar.jsx mounted only the *selected* category's cards
// (`filteredCats` defaulted to `[{ key: cat, items: ADHKAR[cat].items }]`),
// so switching categories fully unmounted the previous category's cards and
// mounted the new one — a crawler's initial/prerendered render only ever
// saw one category (10 of the real 49 adhkar), the same class of bug as the
// pre-fix FAQ page's `items.slice(0, VISIBLE)`. The fix mounts every
// category's cards unconditionally when there is no active search, hiding
// all but the selected one via the standard `hidden` attribute instead of
// not rendering them — search itself (which already re-filters items) is
// unchanged. These tests render the real page and inspect the real DOM to
// prove it, the same way faqInitialAnswers.test.jsx does for FAQ.
//
// Derived, not hardcoded: CATEGORY_KEYS/ADHKAR are the real data. (There
// are 8 real categories, not 7 — the task brief undercounted the same way
// an earlier one undercounted FAQ's 18 questions as 17; deriving these
// numbers from the actual data avoids baking that miscount into the test.)
const TOTAL_CATEGORIES = CATEGORY_KEYS.length;
const TOTAL_CARDS = CATEGORY_KEYS.reduce((sum, key) => sum + ADHKAR[key].items.length, 0);
const DEFAULT_CATEGORY = 'sabah';
const DEFAULT_CATEGORY_COUNT = ADHKAR[DEFAULT_CATEGORY].items.length;

function renderHarness(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <LangProvider>
      <QueryProvider>
        <AuthProvider>
          <AdminAuthProvider>
            <BrowserRouter basename={basename}>
              <Adhkar />
            </BrowserRouter>
          </AdminAuthProvider>
        </AuthProvider>
      </QueryProvider>
    </LangProvider>,
  );
}

function categoryGroups(container) {
  // Each category's cards live in a `.adhkar__list`, itself wrapped in the
  // element that carries the `hidden` attribute this fix added.
  return [...container.querySelectorAll('.adhkar__list')].map((list) => ({
    wrapper: list.parentElement,
    cards: [...list.querySelectorAll('.adhkar__card')],
  }));
}

function searchInput(container) {
  return container.querySelector('.adhkar__search');
}

describe('Adhkar — all categories/cards present in initial DOM', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  const locales = [
    { name: 'EN', path: '/tools/adhkar' },
    { name: 'AR', path: '/ar/tools/adhkar' },
  ];

  for (const { name, path } of locales) {
    it(`${name}: all ${TOTAL_CATEGORIES} categories and all ${TOTAL_CARDS} cards are in the DOM before any click, not just the default category`, () => {
      const { container } = renderHarness(path);
      const groups = categoryGroups(container);
      expect(groups).toHaveLength(TOTAL_CATEGORIES);

      const totalCards = groups.reduce((sum, g) => sum + g.cards.length, 0);
      expect(totalCards).toBe(TOTAL_CARDS);
    });

    it(`${name}: initial state — only the "${DEFAULT_CATEGORY}" category is visible, the other ${TOTAL_CATEGORIES - 1} are hidden (not removed)`, () => {
      const { container } = renderHarness(path);
      const buttons = [...container.querySelectorAll('.adhkar__cat-btn')];
      expect(buttons).toHaveLength(TOTAL_CATEGORIES);

      const groups = categoryGroups(container);
      const visible = groups.filter((g) => !g.wrapper.hidden);
      const hidden = groups.filter((g) => g.wrapper.hidden);

      expect(visible).toHaveLength(1);
      expect(visible[0].cards).toHaveLength(DEFAULT_CATEGORY_COUNT);

      expect(hidden).toHaveLength(TOTAL_CATEGORIES - 1);
      const hiddenCardCount = hidden.reduce((sum, g) => sum + g.cards.length, 0);
      expect(hiddenCardCount).toBe(TOTAL_CARDS - DEFAULT_CATEGORY_COUNT);
    });

    it(`${name}: switching category never removes the previous category's cards from the DOM, only toggles which group is hidden`, () => {
      const { container } = renderHarness(path);
      const groupsBefore = categoryGroups(container);
      expect(groupsBefore).toHaveLength(TOTAL_CATEGORIES);
      const sabahCardsBefore = groupsBefore.find((g) => !g.wrapper.hidden).cards;

      const buttons = [...container.querySelectorAll('.adhkar__cat-btn')];
      // Second button = second category in CATEGORY_KEYS order (masaa).
      fireEvent.click(buttons[1]);

      const groupsAfter = categoryGroups(container);
      expect(groupsAfter).toHaveLength(TOTAL_CATEGORIES);
      const totalCardsAfter = groupsAfter.reduce((sum, g) => sum + g.cards.length, 0);
      expect(totalCardsAfter).toBe(TOTAL_CARDS);

      const visibleAfter = groupsAfter.filter((g) => !g.wrapper.hidden);
      expect(visibleAfter).toHaveLength(1);
      expect(visibleAfter[0].cards).toHaveLength(ADHKAR[CATEGORY_KEYS[1]].items.length);

      // The originally-visible (sabah) group is now hidden, but its DOM
      // nodes are the exact same nodes as before — no unmount/remount.
      const sabahGroupAfter = groupsAfter.find((g) => g.cards[0] === sabahCardsBefore[0]);
      expect(sabahGroupAfter, 'sabah cards must be the same DOM nodes, not remounted').toBeTruthy();
      expect(sabahGroupAfter.wrapper.hidden).toBe(true);
      expect(sabahGroupAfter.cards).toHaveLength(sabahCardsBefore.length);
    });

    it(`${name}: search still filters to matching items across categories, unaffected by the always-mounted default view`, () => {
      const { container } = renderHarness(path);
      const input = searchInput(container);
      expect(input).toBeTruthy();

      // A distinctive substring of sb3's Arabic recitation text (`.adhkar__ar`
      // is always rendered regardless of locale, unlike the translated
      // `.adhkar__translation`/`.adhkar__fadl`, which are English-only).
      const needle = 'خَلَقْتَنِي وَأَنَا عَبْدُكَ';
      fireEvent.change(input, { target: { value: needle } });

      const cards = [...container.querySelectorAll('.adhkar__card')];
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.length).toBeLessThan(TOTAL_CARDS);

      for (const card of cards) {
        expect(card.querySelector('.adhkar__ar').textContent).toContain(needle);
      }

      // In search mode, no category wrapper is hidden — the filtered set
      // itself is the whole result.
      const groups = categoryGroups(container);
      expect(groups.every((g) => !g.wrapper.hidden)).toBe(true);

      // Clearing the search restores the default view (only the originally
      // selected category visible, everything else hidden again).
      fireEvent.change(input, { target: { value: '' } });
      const groupsAfterClear = categoryGroups(container);
      const visibleAfterClear = groupsAfterClear.filter((g) => !g.wrapper.hidden);
      expect(visibleAfterClear).toHaveLength(1);
      const totalCardsAfterClear = groupsAfterClear.reduce((sum, g) => sum + g.cards.length, 0);
      expect(totalCardsAfterClear).toBe(TOTAL_CARDS);
    });

    it(`${name}: an empty localStorage renders the same base content as a populated one, with no console warnings/errors`, () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { container: emptyContainer, unmount } = renderHarness(path);
      const emptyH1 = emptyContainer.querySelector('h1')?.textContent;
      const emptyFirstCardText = emptyContainer.querySelector('.adhkar__ar')?.textContent;
      unmount();

      localStorage.setItem('adhkar-done', JSON.stringify({ sb1: true, sb3: true }));
      localStorage.setItem('adhkar-counts', JSON.stringify({ sb9: 47, sb2: 1 }));

      const { container: populatedContainer } = renderHarness(path);
      const populatedH1 = populatedContainer.querySelector('h1')?.textContent;
      const populatedFirstCardText = populatedContainer.querySelector('.adhkar__ar')?.textContent;

      expect(populatedH1).toBe(emptyH1);
      expect(populatedFirstCardText).toBe(emptyFirstCardText);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  }
});
