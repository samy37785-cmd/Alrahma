import { describe, it, expect } from 'vitest';
import en from '../i18n/en.js';
import ar from '../i18n/ar.js';
import de from '../i18n/de.js';
import es from '../i18n/es.js';
import fr from '../i18n/fr.js';
import it_ from '../i18n/it.js';

// Phase 0 guardrail: the six locale files are hand-maintained object
// literals with no tooling — a key added to en.js but forgotten in de.js
// only surfaces when a German user hits the missing string at runtime.
// This test freezes structural parity: every locale must expose exactly
// the same key paths as en.js, with the same value kinds (string vs
// nested object vs array), so drift fails CI instead of shipping.

const LOCALES = { ar, de, es, fr, it: it_ };

// `lang`/`dir` are intentionally different per file; everything else must
// match structurally.
function keyPaths(obj, prefix = '') {
  const paths = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      paths.push(`${path}:array`);
    } else if (value !== null && typeof value === 'object') {
      paths.push(...keyPaths(value, path));
    } else {
      paths.push(`${path}:${typeof value}`);
    }
  }
  return paths;
}

describe('i18n locale key parity', () => {
  const enPaths = new Set(keyPaths(en));

  for (const [name, locale] of Object.entries(LOCALES)) {
    it(`${name}.js has exactly the key structure of en.js`, () => {
      const localePaths = new Set(keyPaths(locale));

      const missing = [...enPaths].filter((p) => !localePaths.has(p));
      const extra = [...localePaths].filter((p) => !enPaths.has(p));

      expect(missing, `keys in en.js missing from ${name}.js`).toEqual([]);
      expect(extra, `keys in ${name}.js that don't exist in en.js`).toEqual([]);
    });
  }

  it('en.js has no empty string values', () => {
    const empty = keyPaths(en).filter((p) => p.endsWith(':string')).filter((p) => {
      const path = p.slice(0, p.lastIndexOf(':')).split('.');
      let v = en;
      for (const seg of path) v = v[seg];
      return typeof v === 'string' && v.trim() === '';
    });
    expect(empty).toEqual([]);
  });
});
