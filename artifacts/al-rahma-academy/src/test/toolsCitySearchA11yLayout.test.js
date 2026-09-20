// @vitest-environment node
//
// Mobile city-search fix (2026-09-20): on Mobile + Arabic only, the city
// search "Search"/"بحث" button in Qibla and Islamic Calendar was rendered
// entirely off-screen (negative x / clipped past the viewport edge) because
// .it__city-input's `flex: 1` had no `min-width: 0`, so the flex item
// refused to shrink below its intrinsic content width inside the narrow
// mobile card layout. Prayer Times never showed the bug because it already
// had a scoped fix in responsive.css (`.it__controls .it__city-input {
// min-width: 0 }`, see that file's own comment) -- but Qibla/Islamic
// Calendar render the same .it__city-input OUTSIDE .it__controls, so that
// scoped rule never applied to them. This file proves both halves of the
// fix: the base CSS rule now lets the input shrink everywhere (not just
// inside .it__controls), and every city-search field across the three
// pages has a real accessible name plus id/name attributes -- closing the
// pre-existing "No label associated with a form field" / "A form field
// element should have an id or name attribute" DevTools warnings on these
// specific fields. This is layout/a11y only -- no content, translation,
// calculation logic, or API behaviour changed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(import.meta.dirname, '..');
const CSS = readFileSync(join(SRC_ROOT, 'styles/islamic-tools.css'), 'utf8');

// Isolate just the .it__city-row/.it__city-input/.it__city-btn rule block
// (from the .it__city-form rule through the .it__err rule that follows it)
// so these assertions can't accidentally pass by matching some unrelated
// min-width/flex-wrap declaration elsewhere in this large stylesheet.
const CITY_BLOCK = CSS.slice(CSS.indexOf('.it__city-form'), CSS.indexOf('.it__err'));

describe('City search row: base CSS lets the input shrink on narrow/RTL layouts', () => {
  it('.it__city-row wraps instead of silently clipping content that still does not fit', () => {
    const rowRule = CITY_BLOCK.match(/\.it__city-row\s*\{[^}]*\}/)[0];
    expect(rowRule).toMatch(/flex-wrap:\s*wrap/);
  });

  it('.it__city-input can shrink below its intrinsic content width (the actual bug)', () => {
    const inputRule = CITY_BLOCK.match(/\.it__city-input\s*\{[^}]*\}/)[0];
    expect(inputRule).toMatch(/min-width:\s*0/);
  });

  it('.it__city-btn never shrinks -- the button stays fully visible/tappable, the input absorbs the squeeze', () => {
    const btnRule = CITY_BLOCK.match(/\.it__city-btn\s*\{[^}]*\}/)[0];
    expect(btnRule).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('sanity: a rule without min-width:0 would fail the shrink check (not a vacuous regex)', () => {
    const oldBuggyRule = '.it__city-input { flex: 1; padding: 9px 14px; }';
    expect(oldBuggyRule).not.toMatch(/min-width:\s*0/);
  });
});

describe('City search inputs: every occurrence in the three fixed pages has a real accessible name + id/name', () => {
  const CASES = [
    {
      file: 'pages/tools/PrayerTimesPage.jsx',
      // Prayer Times already had a visible <label>{tx.changeCity}</label>
      // sitting right above the row -- it just wasn't associated with the
      // input. The fix wires htmlFor/id to the EXISTING visible label
      // rather than adding a redundant aria-label.
      expectAssociatedLabel: true,
    },
    { file: 'pages/tools/QiblaPage.jsx', occurrences: 2 },
    { file: 'pages/tools/IslamicCalendarPage.jsx', occurrences: 2 },
  ];

  for (const { file, occurrences = 1, expectAssociatedLabel = false } of CASES) {
    it(`${file}: every it__city-input has id + name + a resolvable accessible name`, () => {
      const source = readFileSync(join(SRC_ROOT, file), 'utf8');
      // Non-greedy + dotAll (via [\s\S]) so it spans multi-line JSX attributes
      // without prematurely stopping at the bare `>` inside an
      // `onChange={(e) => ...}` arrow function -- ends at the real `/>`.
      const inputTags = source.match(/<input[\s\S]*?it__city-input[\s\S]*?\/>/g) || [];
      expect(inputTags, `${file} should still render its city-search input(s)`).toHaveLength(occurrences);

      for (const tag of inputTags) {
        expect(tag, `${file} input missing id`).toMatch(/\bid="[\w-]+"/);
        expect(tag, `${file} input missing name`).toMatch(/\bname="[\w-]+"/);
        const hasAriaLabel = /aria-label=\{/.test(tag);
        expect(
          hasAriaLabel || expectAssociatedLabel,
          `${file} input needs either aria-label or an associated <label htmlFor>`
        ).toBe(true);
      }

      if (expectAssociatedLabel) {
        const inputId = inputTags[0].match(/\bid="([\w-]+)"/)[1];
        expect(source, `${file} should have a <label htmlFor="${inputId}">`)
          .toMatch(new RegExp(`<label[^>]*htmlFor="${inputId}"`));
      }
    });
  }

  it('sanity: the old unlabelled markup would fail this check (not a vacuous check)', () => {
    const oldTag = '<input className="it__city-input" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder} />';
    expect(oldTag).not.toMatch(/\bid="[\w-]+"/);
    expect(oldTag).not.toMatch(/\bname="[\w-]+"/);
    expect(oldTag).not.toMatch(/aria-label=\{/);
  });
});
