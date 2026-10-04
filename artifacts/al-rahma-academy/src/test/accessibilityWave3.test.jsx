import { describe, it, expect, afterEach } from 'vitest';
import { within, cleanup, act, fireEvent } from '@testing-library/react';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Home from '../pages/Home';

// Accessibility Wave 3 (jsdom half): names and ARIA of the Home sections that
// only mount after scrolling. Contrast and the real mobile layout are measured
// against the built site in accessibilityWave3.layout.test.js.
//
//   .tc3__verified        Al-Azhar badge icon: aria-label on a role-less span
//                          -> role="img" (it is an image with a text alternative)
//   .trust-bar__wa        WhatsApp link: aria-label hid its visible text
//                          -> named by the visible text; the old label is the title
//   .nav__mobile-search   mobile search button: same fix as the WhatsApp link

useFullPageEnvironment();

const LOCALES = [
  { lang: 'en', url: '/', dir: 'ltr' },
  { lang: 'ar', url: '/ar/', dir: 'rtl' },
  { lang: 'fr', url: '/fr/', dir: 'ltr' },
  { lang: 'it', url: '/it/', dir: 'ltr' },
];
const norm = (s) => s.replace(/\s+/g, ' ').trim();

afterEach(() => cleanup());

describe('teacher cards (.tc3): no prohibited ARIA', () => {
  for (const { lang, url } of LOCALES) {
    it(`${lang}: every Al-Azhar badge is an image with a name; nothing role-less in the avatar column carries aria-label`, async () => {
      await mountFullPage(url, Home);
      const badges = [...document.querySelectorAll('.tc3__verified')];
      expect(badges.length).toBeGreaterThan(0);
      for (const b of badges) {
        expect(b.getAttribute('role')).toBe('img');
        const name = b.getAttribute('aria-label');
        expect(name && name.trim().length).toBeTruthy();
        // Same text as before, also kept as the tooltip.
        expect(b.getAttribute('title')).toBe(name);
        // The check-mark SVG inside is not exposed separately.
        expect(b.querySelector('svg')?.closest('[aria-hidden="true"], [role="img"]')).not.toBeNull();
      }
      // aria-prohibited-attr: the badge's avatar column has no role-less element with aria-label.
      // (The review-count spans in the card body are a separate, out-of-scope finding.)
      const offenders = [...document.querySelectorAll('.tc3__avatar-col span[aria-label], .tc3__avatar-col div[aria-label]')]
        .filter((el) => !el.getAttribute('role'));
      expect(offenders).toEqual([]);
      // The badge is still reachable by its name in the accessibility tree.
      const section = badges[0].closest('section') || document.body;
      expect(within(section).getAllByRole('img', { name: badges[0].getAttribute('aria-label') }).length).toBe(badges.length);
    });
  }
});

describe('.trust-bar__wa: named by its visible text; link unchanged', () => {
  for (const { lang, url } of LOCALES) {
    it(`${lang}: no aria-label, name = visible text, same wa.me href / target / rel, old label kept as title`, async () => {
      await mountFullPage(url, Home);
      const link = document.querySelector('.trust-bar__wa');
      expect(link).not.toBeNull();
      expect(link.hasAttribute('aria-label')).toBe(false);
      expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+$/);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('title')).toBeTruthy();
      const visible = norm(link.textContent);
      expect(visible.length).toBeGreaterThan(0);
      const found = within(link.parentElement).getByRole('link', { name: visible });
      expect(found).toBe(link);
      // The status dot is decorative.
      expect(link.querySelector('.trust-bar__wa-dot').getAttribute('aria-hidden')).toBe('true');
    });
  }
});

describe('.nav__mobile-search: named by its visible text, with the mobile menu open', () => {
  for (const { lang, url, dir } of LOCALES) {
    it(`${lang}: no aria-label, name = visible text, opens the command palette as before (${dir})`, async () => {
      await mountFullPage(url, Home);
      expect(document.documentElement.getAttribute('dir') || 'ltr').toBe(dir);
      const toggle = document.querySelector('.nav-toggle');
      await act(async () => { fireEvent.click(toggle); });
      expect(document.querySelector('nav.nav').className).toContain('open');

      const btn = document.querySelector('.nav__mobile-search');
      expect(btn).not.toBeNull();
      expect(btn.hasAttribute('aria-label')).toBe(false);
      expect(btn.getAttribute('title')).toBeTruthy();
      const visible = norm(btn.textContent);
      const found = within(document.querySelector('nav.nav')).getByRole('button', { name: visible });
      expect(found).toBe(btn);
      // The visible prompt is the start of the name (label in name).
      expect(visible.startsWith(norm(btn.querySelector('span:not(.nav__mobile-search-icon)').textContent))).toBe(true);

      // Behaviour unchanged: clicking opens the command palette and closes the menu.
      await act(async () => { fireEvent.click(btn); });
      expect(document.querySelector('nav.nav').className).not.toContain('open');
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });
  }
});
