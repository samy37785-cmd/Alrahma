import { describe, it, expect, vi, afterEach } from 'vitest';
import { homeHref, goHome, pathFor, stripLangPrefix, langFromPath, switchLanguageHref } from '../utils/localePath';

// Stage 1 URL Closure (see docs/localization-audit.md, Section 5): unit
// coverage for goHome(), the safe replacement for navigate('/') used by
// DashboardLayout's logout and EnrollWizard's "Back Home" button. Real
// button-click coverage lives in DashboardLayout.homeNavigation.test.jsx
// and EnrollWizard.homeNavigation.test.jsx; this file proves the
// underlying utility itself, isolated from any component.

function withPathname(pathname, fn) {
  const original = window.location.pathname;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, pathname },
  });
  try {
    return fn();
  } finally {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: original },
    });
  }
}

describe('goHome: en/fr/it, never navigate("/")-shaped output', () => {
  afterEach(() => vi.restoreAllMocks());

  it('English: goHome() assigns to "/"', () => {
    withPathname('/dashboard', () => {
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      goHome();
      expect(assign).toHaveBeenCalledWith('/');
    });
  });

  it('French: goHome() assigns to "/fr/" - with trailing slash, unlike navigate(\'/\')', () => {
    withPathname('/fr/dashboard', () => {
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      goHome();
      expect(assign).toHaveBeenCalledWith('/fr/');
    });
  });

  it('Italian: goHome() assigns to "/it/" - with trailing slash', () => {
    withPathname('/it/enroll', () => {
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      goHome();
      expect(assign).toHaveBeenCalledWith('/it/');
    });
  });

  it('never produces a doubled prefix like "/fr/fr/"', () => {
    withPathname('/fr/courses/ijazah', () => {
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      goHome();
      expect(assign).toHaveBeenCalledWith(expect.not.stringContaining('/fr/fr'));
    });
  });

  it('passes a hash through when given one', () => {
    withPathname('/fr/dashboard', () => {
      const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      goHome('trial');
      expect(assign).toHaveBeenCalledWith('/fr/#trial');
    });
  });
});

describe('homeHref: matches pathFor(\'/\', lang) for every supported language', () => {
  it.each(['en', 'fr', 'it', 'ar', 'es', 'de'])('%s', (lang) => {
    const pathname = lang === 'en' ? '/dashboard' : `/${lang}/dashboard`;
    withPathname(pathname, () => {
      expect(homeHref()).toBe(pathFor('/', lang));
    });
  });
});

describe('switchLanguageHref: language-switch transitions (11-13)', () => {
  it('11. FR -> EN: drops the /fr prefix, keeps the route', () => {
    expect(switchLanguageHref('/fr/courses/ijazah', '', '', 'en')).toBe('/courses/ijazah');
  });

  it('12. EN -> FR: adds the /fr prefix to an unprefixed route', () => {
    expect(switchLanguageHref('/courses/ijazah', '', '', 'fr')).toBe('/fr/courses/ijazah');
  });

  it('13. FR -> IT: swaps one prefix for another, never stacking both', () => {
    const result = switchLanguageHref('/fr/courses/ijazah', '', '', 'it');
    expect(result).toBe('/it/courses/ijazah');
    expect(result).not.toContain('/fr');
  });

  it('preserves query (minus a legacy lang= if present) and hash across a switch', () => {
    expect(switchLanguageHref('/fr/courses/ijazah', '?foo=bar', '#lesson', 'it'))
      .toBe('/it/courses/ijazah?foo=bar#lesson');
  });
});

describe('stripLangPrefix / langFromPath: sanity (used throughout goHome/homeHref)', () => {
  it('recognizes every supported non-English prefix', () => {
    for (const lang of ['fr', 'it', 'ar', 'es', 'de']) {
      expect(langFromPath(`/${lang}/courses/ijazah`)).toEqual({ lang, basename: `/${lang}` });
    }
  });

  it('treats an unrecognized segment as unprefixed (English)', () => {
    expect(langFromPath('/xx/courses/ijazah')).toEqual({ lang: null, basename: '' });
  });

  it('strips the prefix down to the bare route', () => {
    expect(stripLangPrefix('/fr/courses/ijazah')).toBe('/courses/ijazah');
    expect(stripLangPrefix('/courses/ijazah')).toBe('/courses/ijazah');
  });
});
