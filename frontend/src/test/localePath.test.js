import { describe, it, expect, beforeEach } from 'vitest';
import { langFromPath, pathFor, stripLangPrefix, switchLanguageHref } from '../utils/localePath.js';

// Regression coverage for the /fr/resources/faq class of bug: switching
// language must never lose the current hash or non-lang query params, must
// strip a stale ?lang= param rather than concatenating it alongside the new
// path prefix, and must persist the choice to localStorage so a later page
// load doesn't fall back to a stale saved preference.

beforeEach(() => {
  localStorage.clear();
});

describe('langFromPath / pathFor / stripLangPrefix', () => {
  it('recognizes a prefixed path and computes the matching basename', () => {
    expect(langFromPath('/fr/courses/ijazah')).toEqual({ lang: 'fr', basename: '/fr' });
  });

  it('treats English and unrecognized segments as unprefixed', () => {
    expect(langFromPath('/courses/ijazah')).toEqual({ lang: null, basename: '' });
    expect(langFromPath('/xx/courses')).toEqual({ lang: null, basename: '' });
  });

  it('pathFor never prefixes English', () => {
    expect(pathFor('/courses/ijazah', 'en')).toBe('/courses/ijazah');
    expect(pathFor('/', 'en')).toBe('/');
  });

  it('pathFor prefixes every other language, home path included', () => {
    expect(pathFor('/courses/ijazah', 'fr')).toBe('/fr/courses/ijazah');
    expect(pathFor('/', 'fr')).toBe('/fr/');
  });

  it('stripLangPrefix is the inverse of pathFor for the home path both ways', () => {
    expect(stripLangPrefix('/fr/')).toBe('/');
    expect(stripLangPrefix('/')).toBe('/');
  });
});

describe('switchLanguageHref', () => {
  it('strips a legacy ?lang= param while switching', () => {
    expect(switchLanguageHref('/page', '?lang=de', '', 'fr')).toBe('/fr/page');
  });

  it('preserves other query params and only removes lang', () => {
    expect(switchLanguageHref('/page', '?utm_source=x&lang=de', '', 'fr')).toBe('/fr/page?utm_source=x');
  });

  it('preserves the hash (the exact /fr/resources/faq #trial bug)', () => {
    expect(switchLanguageHref('/fr/resources/faq', '', '#trial', 'de')).toBe('/de/resources/faq#trial');
  });

  it('preserves a hash on a route with no query at all', () => {
    expect(switchLanguageHref('/fr/courses/quran', '', '#hifz', 'de')).toBe('/de/courses/quran#hifz');
  });

  it('round-trips the home path both directions', () => {
    expect(switchLanguageHref('/', '', '', 'fr')).toBe('/fr/');
    expect(switchLanguageHref('/fr/', '', '', 'fr')).toBe('/fr/');
  });

  it('handles a deep path with both query and hash together', () => {
    expect(switchLanguageHref('/fr/courses/ijazah', '?ref=x', '#stage-2', 'de'))
      .toBe('/de/courses/ijazah?ref=x#stage-2');
  });

  it('produces an unprefixed English target with no leftover lang param', () => {
    expect(switchLanguageHref('/fr/courses/ijazah', '?lang=ar&ref=x', '', 'en'))
      .toBe('/courses/ijazah?ref=x');
  });

  it('persists the target language to localStorage', () => {
    switchLanguageHref('/fr/', '', '', 'de');
    expect(localStorage.getItem('lang')).toBe('de');
  });
});
