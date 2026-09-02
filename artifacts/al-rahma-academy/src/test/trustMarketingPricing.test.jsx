import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Pricing from '../components/features/marketing/Pricing';
import { plans } from '../data';

// Trust/marketing remediation spec §5: Pricing's countdown ("Offer ends
// Sunday", recomputed every week) and "spots remaining" (seeded to the ISO
// week number) were removed as artificial scarcity with no real campaign
// record behind them. This file guards the removal and confirms the real
// pricing/plan/CTA functionality still works.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

describe('Pricing no longer shows artificial urgency (spec §5)', () => {
  it('does not render a countdown timer', () => {
    const { container } = renderWithLang(<Pricing />);
    expect(container.querySelector('.pricing__countdown')).toBeNull();
    expect(container.querySelector('.pricing__banner')).toBeNull();
  });

  it('does not render a "spots remaining" scarcity line', () => {
    const { container } = renderWithLang(<Pricing />);
    expect(container.querySelector('.pricing__spots')).toBeNull();
    expect(container.textContent).not.toMatch(/spots? (left|remaining)/i);
    expect(container.textContent).not.toContain('Offer ends');
  });

  it('does not leave a repeating interval/timer behind after mount', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    try {
      const { unmount } = renderWithLang(<Pricing />);
      // Advance time well past what a 1s countdown tick would have used.
      vi.advanceTimersByTime(5000);
      expect(setIntervalSpy).not.toHaveBeenCalled();
      unmount();
    } finally {
      setIntervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('does not claim an unsupported "2x faster" completion statistic', () => {
    const { container } = renderWithLang(<Pricing />);
    expect(container.textContent).not.toMatch(/2×?\s*faster/i);
  });

  it('the countdown/spots helper functions and their CSS are gone from source', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/features/marketing/Pricing.jsx'),
      'utf8',
    );
    expect(src).not.toMatch(/function\s+spotsLeft/);
    expect(src).not.toMatch(/function\s+useCountdown/);
    expect(src).not.toMatch(/function\s+getNextSundayDeadline/);
  });
});

describe('Pricing plans/prices/CTA still work (spec §5 regression guard)', () => {
  it('renders every real plan name, price and a working "Get Started" CTA', () => {
    const { container } = renderWithLang(<Pricing />);
    // Some plans' originalPrice happens to equal another plan's price
    // (e.g. Huffaz's €112 struck-through original == Ijazah's €112 price),
    // so compare the rendered set of amounts rather than querying each
    // price string individually (which would match more than one node).
    const renderedAmounts = Array.from(
      container.querySelectorAll('.plan__price-amount'),
    ).map((el) => el.textContent);
    expect(renderedAmounts.sort()).toEqual([...plans.map((p) => p.price)].sort());
    for (const plan of plans) {
      expect(screen.getByText(plan.name)).toBeInTheDocument();
    }
    const ctaButtons = screen.getAllByRole('button', { name: /get started|commencer|inizia|empezar|ابدأ|starten|jetzt/i });
    expect(ctaButtons.length).toBeGreaterThanOrEqual(plans.length);
  });

  it('keeps the owner-confirmed 24-day refund window copy', () => {
    renderWithLang(<Pricing />);
    expect(screen.getAllByText(/24-Day Refund Window/i).length).toBeGreaterThan(0);
  });

  it('keeps the currency selector functional', () => {
    renderWithLang(<Pricing />);
    const group = screen.getByRole('group', { name: /currency selector/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /USD/ })).toBeInTheDocument();
  });
});
