import { describe, it, expect } from 'vitest';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';
import de from '../i18n/de.js';
import es from '../i18n/es.js';
import fr from '../i18n/fr.js';
import it_ from '../i18n/it.js';
import experienceText from '../i18n/experience.js';

// Phase 0 guardrail: the six locale files are hand-maintained object
// literals with no tooling — a key added to en.js but forgotten in de.js
// only surfaces when a German user hits the missing string at runtime.
// This test freezes structural parity: every locale must expose exactly
// the same key paths as en.js, with the same value kinds (string vs
// nested object vs array), so drift fails CI instead of shipping.

const LOCALES = { ar, de, es, fr, it: it_ };
const INTENTIONALLY_EMPTY = new Set([
  'hubs.courses.cards[1].badge',
  'hubs.courses.cards[3].badge',
]);

// `lang`/`dir` are intentionally different per file; everything else must
// match structurally.
function keyPaths(obj, prefix = '') {
  const paths = [];
  if (Array.isArray(obj)) {
    paths.push(`${prefix}:array(${obj.length})`);
    obj.forEach((value, index) => {
      const path = `${prefix}[${index}]`;
      if (value !== null && typeof value === 'object') {
        paths.push(...keyPaths(value, path));
      } else {
        paths.push(`${path}:${typeof value}`);
      }
    });
    return paths;
  }

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      paths.push(...keyPaths(value, path));
    } else if (value !== null && typeof value === 'object') {
      paths.push(...keyPaths(value, path));
    } else {
      paths.push(`${path}:${typeof value}`);
    }
  }
  return paths;
}

function leafValues(obj, prefix = '', leaves = {}) {
  if (Array.isArray(obj)) {
    obj.forEach((value, index) => leafValues(value, `${prefix}[${index}]`, leaves));
  } else if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      leafValues(value, prefix ? `${prefix}.${key}` : key, leaves);
    }
  } else {
    leaves[prefix] = obj;
  }
  return leaves;
}

function interpolationTokens(value) {
  return typeof value === 'string'
    ? [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort()
    : [];
}

describe('i18n locale key parity', () => {
  const enPaths = new Set(keyPaths(en));
  const enLeaves = leafValues(en);

  for (const [name, locale] of Object.entries(LOCALES)) {
    it(`${name}.js has exactly the key structure of en.js`, () => {
      const localePaths = new Set(keyPaths(locale));

      const missing = [...enPaths].filter((p) => !localePaths.has(p));
      const extra = [...localePaths].filter((p) => !enPaths.has(p));

      expect(missing, `keys in en.js missing from ${name}.js`).toEqual([]);
      expect(extra, `keys in ${name}.js that don't exist in en.js`).toEqual([]);

      const localeLeaves = leafValues(locale);
      const placeholderMismatches = Object.keys(enLeaves).filter(
        (path) => interpolationTokens(enLeaves[path]).join('|') !== interpolationTokens(localeLeaves[path]).join('|'),
      );
      expect(placeholderMismatches, `interpolation placeholders that differ in ${name}.js`).toEqual([]);
    });
  }

  it('en.js has no empty string values', () => {
    const empty = Object.entries(enLeaves)
      .filter(([path, value]) => (
        typeof value === 'string'
        && value.trim() === ''
        && !INTENTIONALLY_EMPTY.has(path)
      ))
      .map(([path]) => path);
    expect(empty).toEqual([]);
  });
});

describe('shared experience locale parity', () => {
  const enPaths = new Set(keyPaths(experienceText.en));

  for (const name of ['it', 'es', 'de', 'fr']) {
    it(`${name} shared UI has exactly the English structure`, () => {
      const localePaths = new Set(keyPaths(experienceText[name]));
      expect([...enPaths].filter((path) => !localePaths.has(path))).toEqual([]);
      expect([...localePaths].filter((path) => !enPaths.has(path))).toEqual([]);
    });
  }
});
