import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Hero from '../components/features/marketing/Hero';
import Footer from '../components/layout/Footer';
import About from '../components/features/marketing/About';
import { stats as aboutStats } from '../data/about';

// Teachers.jsx renders the site <Header/>, which needs Auth/Query
// providers unrelated to this task's scope — stub it out (same pattern as
// AdminDashboard.test.jsx) so these tests exercise Teachers.jsx's own
// content without pulling in unrelated auth machinery. Footer.jsx needs no
// such stubbing (it has its own direct tests below, unmocked).
vi.mock('../components/layout/Header', () => ({ default: () => <div /> }));
const { default: Teachers } = await import('../pages/Teachers');

// Trust/marketing remediation (see docs/trust-marketing-remediation.md):
// the initial pass fixed socialProof.js/StatsBanner/Testimonials/Pricing/
// Trial/Newsletter, but re-scanning every marketing component for the same
// five figures (32 tutors, 4.9★, 9,000+ lessons, 40+ countries, 1,200+
// students) surfaced the identical problem duplicated in Hero.jsx (a
// hardcoded stats bar AND a fabricated "live activity" ticker of named
// people), Footer.jsx (a trust-badges strip), About.jsx (an About-page
// stats block and a founder-story sentence) and Teachers.jsx (a stats bar
// and an SEO description). This file covers those.

function renderWithLang(children, pathname = '/') {
  window.history.replaceState({}, '', pathname);
  const { basename } = langFromPath(window.location.pathname);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

describe('Hero.jsx no longer shows unsupported stats or a fabricated activity ticker', () => {
  it('does not render the hardcoded 9,000+/4.9★/40+/32 stats bar', () => {
    const { container } = renderWithLang(<Hero onTrialClick={() => {}} />);
    expect(container.querySelector('.hero__stats-bar')).toBeNull();
    const text = container.textContent;
    expect(text).not.toContain('9,000+');
    expect(text).not.toContain('40+');
  });

  it('does not render the fabricated rotating "just booked a free trial" activity ticker', () => {
    const { container } = renderWithLang(<Hero onTrialClick={() => {}} />);
    expect(container.querySelector('.hero__activity')).toBeNull();
    expect(container.textContent).not.toMatch(/just booked a free trial/i);
    // The eight fabricated first names from LIVE_ACTIVITY must not appear.
    for (const name of ['Ahmad', 'Yusuf', 'Hassan', 'Tariq', 'Nour']) {
      expect(container.textContent).not.toContain(name);
    }
  });

  it('does not render the unsupported "4.9 / 5" rating pill', () => {
    const { container } = renderWithLang(<Hero onTrialClick={() => {}} />);
    expect(container.textContent).not.toContain('4.9 / 5');
  });

  it('does not leave a repeating interval behind (the ticker\'s setInterval is gone)', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    try {
      renderWithLang(<Hero onTrialClick={() => {}} />);
      vi.advanceTimersByTime(10000);
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('keeps the Al-Azhar certification pill (an institutional claim, not a number)', () => {
    renderWithLang(<Hero onTrialClick={() => {}} />);
    expect(screen.getByText('Al-Azhar')).toBeInTheDocument();
  });
});

describe('Footer.jsx trust badges no longer show unsupported numbers', () => {
  it('does not contain "32", "40+" tutor/country figures or an unsupported rating', () => {
    const { container } = renderWithLang(<Footer />);
    const badgeText = container.querySelector('.footer__trust')?.textContent || '';
    expect(badgeText).not.toMatch(/\b32\b/);
    expect(badgeText).not.toMatch(/40\+/);
    expect(badgeText).not.toMatch(/4[.,]9★/);
  });

  it('keeps the owner-confirmed 24-day refund window and 24-hour reply badges', () => {
    const { container } = renderWithLang(<Footer />);
    const badgeText = container.querySelector('.footer__trust')?.textContent || '';
    expect(badgeText).toContain('24-Day Refund Window');
    expect(badgeText).toContain('Reply within 24 hours');
  });
});

describe('About.jsx shows the owner-confirmed academy figures, not the old unsupported ones', () => {
  it('the about-page stats now carry the owner-confirmed figures from siteFacts.js, not the old unsupported ones', () => {
    const values = aboutStats.map((s) => s.value);
    expect(values).toEqual(['15,000+', '30', '1,500+', '4.9/5']);
  });

  it('renders the de-numbered stats block without leaving a visual gap (still 4 cards)', () => {
    const { container } = renderWithLang(<About />);
    const cards = container.querySelectorAll('.about__stats .stat');
    expect(cards.length).toBe(4);
  });

  it('the founder story shows the owner-confirmed "1,200+ families across 10 countries" figure, never the old unsupported "40+ countries"', () => {
    // Content Truth Contract corrective round (2026-09-02): the original
    // remediation de-numbered this sentence for lack of a source; the
    // owner has since confirmed 1,200+ families and 10 countries (not the
    // originally-claimed, unsupported 40+), so the founder story now shows
    // those real, sourced numbers again.
    const { container } = renderWithLang(<About />);
    const text = container.textContent;
    expect(text).toMatch(/1,?200\+?\s*families/i);
    expect(text).toMatch(/10\s*countries/i);
    expect(text).not.toMatch(/40\+?\s*countries/i);
  });
});

describe('Teachers.jsx no longer shows an unsupported stats bar or SEO figure', () => {
  it('does not render a "10+/500+/4.9★/9,000+" stats bar', () => {
    const { container } = renderWithLang(<Teachers />);
    expect(container.querySelector('.tpg__stats-bar')).toBeNull();
  });

  it('renders the Teachers directory heading and filters without the removed stats bar leaving a gap', () => {
    renderWithLang(<Teachers />);
    expect(screen.getByRole('heading', { name: /our qualified tutors/i })).toBeInTheDocument();
  });
});
