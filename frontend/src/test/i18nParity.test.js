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

// Key paths where a locale is allowed to legitimately have a different array
// length or shape than en.js (e.g. a locale-specific badge list that's
// genuinely shorter). Empty today — the deep audit behind this fix found no
// actual current mismatch, only that the old array-blind check couldn't have
// caught one. Add an entry only for a real, deliberate exception, with a
// comment explaining why.
const PARITY_ALLOWLIST = new Set([
  // 'someKey.path', // reason
]);

// `lang`/`dir` are intentionally different per file; everything else must
// match structurally. Recurses into arrays (not just objects) — a locale
// whose array differs from en.js in length, element order, element type, or
// (for arrays of objects) per-element key shape must fail here, not pass
// silently because both arrays reduced to the same opaque "path:array" token.
function keyPaths(obj, prefix = '') {
  const paths = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      if (PARITY_ALLOWLIST.has(path)) {
        // Deliberately excluded from comparison — see PARITY_ALLOWLIST above.
        paths.push(`${path}:array`);
      } else {
        paths.push(`${path}:array:length:${value.length}`);
        value.forEach((item, i) => {
          const itemPath = `${path}[${i}]`;
          if (item !== null && typeof item === 'object') paths.push(...keyPaths(item, itemPath));
          else paths.push(`${itemPath}:${typeof item}`);
        });
      }
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

  // Deliberately-empty string values — an empty string used as a real "no
  // value" sentinel the component checks for (e.g. `card.badge &&
  // <span>...`), not a forgotten translation. Only surfaced now that
  // keyPaths recurses into arrays (previously invisible, opaque "path:array"
  // tokens hid them entirely) — confirmed by reading hubs.courses.cards in
  // en.js: cards[1]/[3] (Hifz, Islamic Studies) intentionally show no badge
  // while their siblings show "Popular"/"Advanced"/etc.
  const EMPTY_STRING_ALLOWLIST = new Set([
    'hubs.courses.cards[1].badge',
    'hubs.courses.cards[3].badge',
  ]);

  it('en.js has no undocumented empty string values', () => {
    // Path segments can now include array indices (e.g. "badges[2].title")
    // since keyPaths recurses into arrays — normalize "[2]" to ".2" so the
    // walk below can resolve it with plain property access either way.
    const empty = keyPaths(en).filter((p) => p.endsWith(':string')).filter((p) => {
      const key = p.slice(0, p.lastIndexOf(':'));
      if (EMPTY_STRING_ALLOWLIST.has(key)) return false;
      const path = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let v = en;
      for (const seg of path) v = v[seg];
      return typeof v === 'string' && v.trim() === '';
    });
    expect(empty).toEqual([]);
  });
});
