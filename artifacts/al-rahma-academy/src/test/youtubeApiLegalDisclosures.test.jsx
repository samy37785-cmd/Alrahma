import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import { LANGS } from '../i18n';
import Privacy, { YOUTUBE_API_PRIVACY_COPY } from '../pages/Privacy';
import TermsOfService from '../pages/TermsOfService';

// YouTube API Services disclosures (2026-10-24), required by the YouTube API
// Services Developer Policies before the API audit: the Privacy Policy says
// the academy uses YouTube API Services, links the Google Privacy Policy and
// the Google permissions page, and the Terms of Service bind users of our
// YouTube features to the YouTube Terms of Service. In every locale, just
// before Contact, text and links only.

vi.mock('../components/layout/Header', () => ({ default: () => <div /> }));
vi.mock('../components/layout/Footer', () => ({ default: () => <div /> }));

const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';
const GOOGLE_PERMISSIONS = 'https://myaccount.google.com/permissions';
const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms';
const EMAIL = 'alrahmaacademy038@gmail.com';

function renderAt(lang, page, Component) {
  const path_ = lang === 'en' ? `/academy/${page}` : `/${lang}/academy/${page}`;
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>
        <Component />
      </LangProvider>
    </BrowserRouter>,
  );
}

const lastH2 = (container) => [...container.querySelectorAll('main h2')].at(-1);

function expectExternalLink(a, href) {
  expect(a, href).not.toBeNull();
  expect(a.textContent).toBe(href);
  expect(a).toHaveAttribute('target', '_blank');
  expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  expect(a).toHaveAttribute('dir', 'ltr');
}

describe('Privacy Policy: YouTube API Services section', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('has a translation in every supported locale, with the English keys', () => {
    expect(Object.keys(YOUTUBE_API_PRIVACY_COPY).sort()).toEqual([...LANGS].sort());
    const keys = Object.keys(YOUTUBE_API_PRIVACY_COPY.en);
    for (const lang of LANGS) {
      expect(Object.keys(YOUTUBE_API_PRIVACY_COPY[lang]), lang).toEqual(keys);
      if (lang === 'en') continue;
      for (const key of keys) {
        expect(YOUTUBE_API_PRIVACY_COPY[lang][key], `${lang}.${key}`).not.toBe(YOUTUBE_API_PRIVACY_COPY.en[key]);
      }
    }
  });

  it('English: the approved wording, exactly', () => {
    const { container } = renderAt('en', 'privacy', Privacy);
    const section = container.querySelector('section#youtube-api-services');
    expect(section.querySelector('h2').textContent).toBe('YouTube API Services');
    expect([...section.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      "Al-Rahma Academy uses YouTube API Services to upload the academy's own videos to its own YouTube channel. Google's handling of data is described in the Google Privacy Policy: https://policies.google.com/privacy",
      "Our publishing tool accesses only the academy's own YouTube channel. It uses the API to upload videos and to confirm that each upload reached our channel. It stores only our channel ID, the IDs of the videos it uploaded and their upload status. It never collects data about viewers or other channels, and it never shares YouTube data with third parties.",
      "You can revoke the tool's access to a Google account at any time from the Google security settings page: https://myaccount.google.com/permissions. To ask us to delete stored data, write to alrahmaacademy038@gmail.com.",
    ]);
  });

  for (const lang of LANGS) {
    it(`${lang}: sits just before Contact, with clickable Google links and a mailto`, () => {
      const { container } = renderAt(lang, 'privacy', Privacy);
      const section = container.querySelector('section#youtube-api-services');
      expect(section).not.toBeNull();
      expect(section.querySelector('h2').textContent).toBe(YOUTUBE_API_PRIVACY_COPY[lang].title);
      // Contact is the page's last heading, and the next thing after this section.
      expect(section.nextElementSibling).toBe(lastH2(container));
      expectExternalLink(section.querySelector(`a[href="${GOOGLE_PRIVACY}"]`), GOOGLE_PRIVACY);
      expectExternalLink(section.querySelector(`a[href="${GOOGLE_PERMISSIONS}"]`), GOOGLE_PERMISSIONS);
      expect(section.querySelector(`a[href="mailto:${EMAIL}"]`).textContent).toBe(EMAIL);
      // Text and links only: no embed, script or media of any kind.
      expect(section.querySelectorAll('iframe, script, img, video, object, embed')).toHaveLength(0);
      expect(document.documentElement).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    });
  }
});

describe('Terms of Service: YouTube API Services paragraph', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English: the approved wording, under its own heading', () => {
    const { container } = renderAt('en', 'terms', TermsOfService);
    const p = container.querySelector(`a[href="${YOUTUBE_TERMS}"]`).parentElement;
    expect(p.textContent).toBe('Our YouTube features use YouTube API Services. By using them, you agree to be bound by the YouTube Terms of Service: https://www.youtube.com/t/terms');
    expect(p.previousElementSibling.textContent).toBe('13. YouTube API Services');
    expect(p.nextElementSibling.textContent).toBe('14. Contact');
  });

  for (const lang of LANGS) {
    it(`${lang}: translated, numbered 13, just before Contact (now 14), with a clickable YouTube Terms link`, () => {
      const { container } = renderAt(lang, 'terms', TermsOfService);
      const links = container.querySelectorAll(`a[href="${YOUTUBE_TERMS}"]`);
      expect(links).toHaveLength(1);
      expectExternalLink(links[0], YOUTUBE_TERMS);
      const p = links[0].parentElement;
      expect(p.tagName).toBe('P');
      expect(p.textContent.length).toBeGreaterThan(YOUTUBE_TERMS.length + 40);
      if (lang !== 'en') expect(p.textContent).not.toMatch(/By using them, you agree/);
      expect(p.previousElementSibling.tagName).toBe('H2');
      expect(p.previousElementSibling.textContent).toMatch(/^(13|١٣)\. /);
      expect(p.nextElementSibling).toBe(lastH2(container));
      expect(p.nextElementSibling.textContent).toMatch(/^(14|١٤)\. /);
      expect(container.querySelectorAll('main h2')).toHaveLength(14);
    });
  }
});
