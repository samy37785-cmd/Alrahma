import { describe, it, expect, vi, afterEach } from 'vitest';
import { within, cleanup, act, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useFullPageEnvironment, mountFullPage } from './utils/fullPageRender';
import Home from '../pages/Home';
import { HOME_LEAKED_STRINGS_TEXT } from '../i18n/home/leakedStrings';
import { CONSENT_COPY } from '../analytics/consentCopy';

// Accessibility Wave 2 (jsdom half): accessible names. The geometry of the
// consent-settings target and the mobile (visually hidden) player label are
// measured in a real browser in accessibilityWave2.layout.test.js.
//
//   .qap__btn            (Quran audio button)  name = its visible label
//   .hero__scroll-cue    (scroll link)         name = its visible text
//   .consent-settings-link                      >= 24px target (layout test)

useFullPageEnvironment();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const LOCALES = [
  { lang: 'en', url: '/' },
  { lang: 'ar', url: '/ar/' },
  { lang: 'fr', url: '/fr/' },
  { lang: 'it', url: '/it/' },
];
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const count = (haystack, needle) => haystack.split(needle).length - 1;

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('.qap__btn: the accessible name is the visible label, said once', () => {
  for (const { lang, url } of LOCALES) {
    it(`${lang}: the name equals the visible label, idle and playing; the title stays as the description`, async () => {
      // jsdom has no media pipeline: stub play/pause so the toggle can be exercised without any audio.
      vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
      vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      await mountFullPage(url, Home);
      const btn = () => document.querySelector('.qap__btn');
      expect(btn()).not.toBeNull();

      for (const [state, key] of [['idle', 'playQuranLabel'], ['playing', 'quranPlayingLabel']]) {
        if (state === 'playing') {
          await act(async () => { fireEvent.click(btn()); });
          await act(async () => { await vi.advanceTimersByTimeAsync(50); });
        }
        expect(btn().hasAttribute('aria-label')).toBe(false);
        const label = norm(btn().querySelector('.qap__label').textContent);
        expect(label).toBe(norm(HOME_LEAKED_STRINGS_TEXT[lang][key]));
        // getByRole computes the real accessible name; an exact string match proves
        // the name is the visible label and nothing more, so nothing is read twice.
        const found = within(document.querySelector('.qap')).getByRole('button', { name: label });
        expect(found).toBe(btn());
        expect(count(norm(btn().textContent), label)).toBe(1);
        expect(btn().getAttribute('title')).toBeTruthy();
      }
      // The icon, spinner and wave are decorative.
      for (const decor of btn().querySelectorAll('svg, .qap__spin, .qap__wave')) {
        expect(decor.closest('[aria-hidden="true"]')).not.toBeNull();
      }
    });
  }

  it('no English label is injected into AR/FR/IT (the English fallback labels are no longer used here)', () => {
    const src = read('components/ui/QuranAudioPlayer.jsx');
    expect(src).not.toMatch(/a11y\.audioPlay\b|a11y\.audioMute\b/);
    // The region and dismiss labels are untouched.
    expect(src).toContain('a11y.audioRegion');
  });
});

describe('.hero__scroll-cue: the accessible name is the visible text, said once', () => {
  for (const { lang, url } of LOCALES) {
    it(`${lang}: no aria-label, named by its visible text, still a link to #courses`, async () => {
      await mountFullPage(url, Home);
      const cue = document.querySelector('.hero__scroll-cue');
      expect(cue).not.toBeNull();
      expect(cue.hasAttribute('aria-label')).toBe(false);
      expect(cue.getAttribute('href')).toBe('#courses');

      const visible = norm(cue.textContent);
      expect(visible.length).toBeGreaterThan(0);
      const hero = cue.closest('section, header, div');
      const found = within(hero).getByRole('link', { name: visible });
      expect(found).toBe(cue);
      expect(count(norm(cue.textContent), visible)).toBe(1);
      // The decorative scroll icon contributes no text.
      expect(cue.querySelector('.hero__scroll-icon').textContent).toBe('');
    });
  }
});

describe('.consent-settings-link', () => {
  for (const { lang, url } of LOCALES) {
    it(`${lang}: still a button with the same text, in the tab order`, async () => {
      vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST12345');
      await mountFullPage(url, Home);
      const link = document.querySelector('.consent-settings-link');
      expect(link).not.toBeNull();
      expect(link.tagName).toBe('BUTTON');
      expect(link.textContent.trim()).toBe(CONSENT_COPY[lang].settings);
      expect(link.tabIndex).toBe(0);
    });
  }

  it('the stylesheet gives it a 24px minimum height without touching its text', () => {
    const css = read('styles/consent.css');
    expect(css).toMatch(/\.consent-settings-link\s*\{[^}]*min-height:\s*24px/);
  });
});
