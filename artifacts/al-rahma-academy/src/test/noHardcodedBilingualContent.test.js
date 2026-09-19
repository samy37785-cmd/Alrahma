// @vitest-environment node
//
// Guard (Phase 2a): forbids the `isAr ? arabic : english` / `lang === 'ar'
// ? ... : ...` fork and the local `{ en: ..., ar: ... }` literal object --
// the exact anti-pattern that silently serves English to it/es/de/fr
// visitors while the page/chrome claims a real translation exists. Scoped
// ONLY to files listed in translationStatus.js's contentSources (the public
// marketing/course/tool/resource pages that have entered this system), not
// the whole src tree -- authenticated/admin pages and infrastructure code
// are out of scope by design (see translationStatus.js's KNOWN_OUT_OF_SCOPE).
//
// Uses a real parser (Vite's transformWithEsbuild + parseAstAsync), same
// convention as internalLinkGuards.test.js.
//
// GRANDFATHERED_FILES below is the exact, named list of contentSources
// files that already violate this pattern as of Phase 2a (2026-09-18) --
// this phase does not touch page content (see translationStatus.js's
// module comment), so pre-existing debt is not fixed here. Each entry is
// removed as its page migrates to the new content-module pattern in a
// later phase (2b/2c/2d). A NEW violation in any non-grandfathered file
// fails this test immediately.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { transformWithEsbuild, parseAstAsync } from 'vite';
import { TRANSLATION_STATUS } from '../data/translationStatus';

const SRC_ROOT = join(import.meta.dirname, '..');

const GRANDFATHERED_FILES = {
  'src/pages/Adhkar.jsx': 'Migrates in Phase 2d.',
};

// Permanent, legitimate exceptions -- not migration debt, never expected to
// be "fixed" or removed. Each is a real isAr-pattern match structurally,
// but verified NOT to be the anti-pattern this guard exists to catch: a
// fork between two pre-written EN/AR content strings. RTL glyph direction
// and pass-through-the-real-Arabic-source cases documented per the
// approved design (2026-09-18).
const DOCUMENTED_EXCEPTIONS = {
  'src/i18n/adhkarText.js':
    "sourceTr()'s `lang === 'ar' ? src : (SOURCE_TR[src] || src)` passes the raw Arabic hadith-collector "
    + 'name through unchanged for Arabic readers and looks up a shared Latin transliteration for every '
    + 'other language (identical string for en/it/es/de/fr, e.g. "Al-Bukhari") -- not a fork between two '
    + 'pre-written translated strings.',
  'src/pages/IslamicTools.jsx':
    "`lang === 'ar' ? '←' : '→'` picks a directional arrow glyph matching RTL vs LTR reading flow, "
    + "identical in effect to a `dir === 'rtl'` check -- not a content fork.",
  'src/pages/Teachers.jsx':
    "Phase 2c small fix (2026-09-18): the page shell's breadcrumb/SEO/langFilter-'All' isAr forks were "
    + 'removed (now read from teachersPg.academy/seoTitle/seoDescription/langAll, per-locale in '
    + "src/i18n/{lang}.js -- teachers.js's own per-teacher data was already 6-language and untouched). "
    + "The one remaining match, TeacherCard's `isAr ? '←' : '→'`, is the same directional-arrow-glyph "
    + 'case as IslamicTools.jsx above -- not a content fork.',
};

// Review follow-up (2026-09-18): a whole-file DOCUMENTED_EXCEPTIONS entry
// for a Phase 2b/2c content module (like src/i18n/courses/ijazah.js) would
// hide any NEW isAr ternary or new binary {en,ar} object added anywhere
// else in that file later -- too broad. This allows a NAMED SET of export
// root object literals (identified by node identity, not just "this file is
// fine") to match the binary-object pattern, because those exports
// legitimately have only en+ar today (their other languages are 'draft' in
// translationStatus.js, not silently faked). Any OTHER violation in the
// same file -- an extra binary object beyond the named set, or any isAr
// ternary anywhere in the file -- still fails this guard. `exportNames` is
// an array (usually one entry; src/i18n/home/leakedStrings.js has two --
// HOME_LEAKED_STRINGS_TEXT and COURSE_OPTION_LABELS_TEXT -- since Arabic
// Home Copy Implementation (2026-09-18) gave both an `ar` key in the same
// file). See the synthetic proof tests below ("LANGUAGE_CONTENT_ROOT_
// EXCEPTIONS mechanism...") for a direct demonstration that this narrowing
// actually works, independent of whatever the real file currently contains.
const LANGUAGE_CONTENT_ROOT_EXCEPTIONS = {
  'src/i18n/courses/ijazah.js': {
    exportNames: ['IJAZAH_TEXT'],
    reason: "Phase 2b content module root. `{ en: {...}, ar: {...} }` only has 2 of 6 languages because "
      + "it/es/de/fr are still genuinely 'draft' in translationStatus.js (not written yet, not silently "
      + 'faked as English) -- this is the replacement for the isAr anti-pattern, not an instance of it. '
      + 'Remove this exception once it/es/de/fr are added and the object has all 6 keys (at which point '
      + 'the hasOtherLangs check below stops matching it at all).',
  },
  'src/i18n/courses/islamic-studies.js': {
    exportNames: ['ISLAMIC_STUDIES_TEXT'],
    reason: 'Phase 2c content module root, same shape/reason as IJAZAH_TEXT above -- only en/ar are '
      + "written; it/es/de/fr are genuinely 'draft' in translationStatus.js. Remove this exception once "
      + 'it/es/de/fr are added and the object has all 6 keys.',
  },
  'src/i18n/home/levelQuiz.js': {
    exportNames: ['LEVEL_QUIZ_TEXT'],
    reason: 'Arabic Home Copy Implementation (2026-09-18): `{ en: {...}, ar: {...} }` -- ar added after '
      + "Claude editorial approval pending human/Islamic review where applicable. it/es/de/fr are still "
      + "genuinely 'draft' in translationStatus.js, not silently faked.",
  },
  'src/i18n/home/isnadChain.js': {
    exportNames: ['ISNAD_CHAIN_TEXT'],
    reason: 'Arabic Home Copy Implementation (2026-09-18): same shape/reason as levelQuiz.js above. '
      + "ar.quote/ar.citation are the one documented, deliberate exception inside this object -- identical "
      + 'to the English Hadith wording, not translated, pending a verified Arabic source (see this file\'s '
      + 'own module comment). it/es/de/fr remain genuinely draft.',
  },
  'src/i18n/home/countries.js': {
    exportNames: ['COUNTRY_NAMES_TEXT'],
    reason: 'Arabic Home Copy Implementation (2026-09-18): same shape/reason as levelQuiz.js above.',
  },
  'src/i18n/home/leakedStrings.js': {
    exportNames: ['HOME_LEAKED_STRINGS_TEXT', 'COURSE_OPTION_LABELS_TEXT'],
    reason: 'Arabic Home Copy Implementation (2026-09-18): both exported content objects in this file '
      + 'gained an `ar` key in the same pass -- same shape/reason as levelQuiz.js above, for each of them '
      + 'independently.',
  },
  'src/i18n/tools/prayerTimes.js': {
    exportNames: ['PRAYER_TIMES_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): Phase 4 content module root, same '
      + "shape/reason as IJAZAH_TEXT above -- only en/ar are written; it/es/de/fr are genuinely 'draft'/"
      + 'absent, not silently faked as English.',
  },
  'src/i18n/tools/qibla.js': {
    exportNames: ['QIBLA_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): same shape/reason as prayerTimes.js above.',
  },
  'src/i18n/tools/islamicCalendar.js': {
    exportNames: ['ISLAMIC_CALENDAR_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): same shape/reason as prayerTimes.js above.',
  },
  'src/i18n/tools/tasbeeh.js': {
    exportNames: ['TASBEEH_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): same shape/reason as prayerTimes.js above.',
  },
  'src/i18n/tools/tajweedChecker.js': {
    exportNames: ['TAJWEED_CHECKER_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): same shape/reason as prayerTimes.js above.',
  },
  'src/i18n/tools/hifzReview.js': {
    exportNames: ['HIFZ_REVIEW_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): same shape/reason as prayerTimes.js above.',
  },
  'src/i18n/tools/relatedTools.js': {
    exportNames: ['RELATED_TOOLS_TEXT'],
    reason: 'Arabic Tools Content Migration (Phase 4, 2026-09-18): shared "Also try" nav text reused by '
      + 'PrayerTimesPage.jsx, QiblaPage.jsx and IslamicCalendarPage.jsx -- same shape/reason as '
      + 'prayerTimes.js above.',
  },
  'src/i18n/hadith/collections.js': {
    exportNames: ['HADITH_COLLECTIONS_TEXT'],
    reason: 'Hadith Library: Source Recovery, Licensed Content Integration (2026-09-18): per-collection '
      + "author/note text root. `{ en: {...}, ar: {...} }` only has 2 of 6 languages because it/es/de/fr "
      + "are genuinely absent by this phase's explicit instruction not to start them for Hadith Library -- "
      + 'same shape/reason as IJAZAH_TEXT above.',
  },
};

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (value && typeof value === 'object') walkAst(value, visit);
  }
}

function isArTernaryTest(node) {
  if (!node) return false;
  if (node.type === 'Identifier' && node.name === 'isAr') return true;
  if (node.type === 'BinaryExpression' && (node.operator === '===' || node.operator === '==')) {
    const isLangIdent = (n) => n.type === 'Identifier' && n.name === 'lang';
    const isArLiteral = (n) => n.type === 'Literal' && n.value === 'ar';
    return (isLangIdent(node.left) && isArLiteral(node.right)) || (isLangIdent(node.right) && isArLiteral(node.left));
  }
  return false;
}

// Finds the ObjectExpression that is the direct initializer of
// `(export) const <exportName> = { ... }` -- used to identify, by node
// identity (not filename), the ONE object literal a single exportName is
// allowed to match.
function findNamedRootObject(ast, exportName) {
  let found = null;
  walkAst(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.id.name === exportName
      && n.init?.type === 'ObjectExpression') {
      found = n.init;
    }
  });
  return found;
}

// Plural form: resolves each name in `exportNames` to its root object node
// (via findNamedRootObject above), dropping any that aren't found. Used for
// LANGUAGE_CONTENT_ROOT_EXCEPTIONS entries, which may name more than one
// export in the same file (e.g. src/i18n/home/leakedStrings.js's two
// exports).
function findNamedRootObjects(ast, exportNames) {
  return exportNames.map((name) => findNamedRootObject(ast, name)).filter((n) => n !== null);
}

// `allowedObjectRootNodes`, when given, marks violations on any of those
// exact nodes (by reference identity, from the same parse) as
// `allowed: true` instead of omitting them -- every OTHER match, anywhere
// else in the same AST, including an extra binary object beyond the named
// set or any isAr ternary, is still a real, unmarked violation.
function findViolations(ast, { allowedObjectRootNodes = [] } = {}) {
  const violations = [];
  walkAst(ast, (node) => {
    if (node.type === 'ConditionalExpression' && isArTernaryTest(node.test)) {
      violations.push({ kind: 'isAr-ternary', allowed: false }); // a ternary is never the allowed root shape
    }
    if (node.type === 'ObjectExpression') {
      const keys = node.properties
        .filter((p) => p.type === 'Property')
        .map((p) => p.key?.name || p.key?.value);
      // Flag only the BINARY anti-pattern: en+ar present with none of the
      // other 4 languages. A real 6-language (or 6-language-minus-one, like
      // adhkarText.js's intentional ar omission) object also has en+ar as a
      // subset of its keys -- that's the correct pattern, not a violation.
      const hasOtherLangs = ['it', 'es', 'de', 'fr'].some((l) => keys.includes(l));
      if (keys.includes('en') && keys.includes('ar') && !hasOtherLangs) {
        violations.push({ kind: 'bilingual-object-literal', allowed: allowedObjectRootNodes.includes(node) });
      }
    }
  });
  return violations;
}

function allContentSourceFiles() {
  const files = new Set();
  for (const entry of Object.values(TRANSLATION_STATUS)) {
    for (const f of entry.contentSources) files.add(f);
  }
  return [...files];
}

let results;
beforeAll(async () => {
  results = {};
  for (const relPath of allContentSourceFiles()) {
    const absPath = join(SRC_ROOT, '..', relPath);
    const source = readFileSync(absPath, 'utf8');
    const loader = extname(absPath) === '.tsx' ? 'tsx' : (extname(absPath) === '.jsx' ? 'jsx' : 'jsx');
    const { code } = await transformWithEsbuild(source, absPath, { loader, jsx: 'transform' });
    const ast = await parseAstAsync(code);
    const rootException = LANGUAGE_CONTENT_ROOT_EXCEPTIONS[relPath];
    const allowedObjectRootNodes = rootException ? findNamedRootObjects(ast, rootException.exportNames) : [];
    results[relPath] = findViolations(ast, { allowedObjectRootNodes });
  }
}, 30000);

describe('noHardcodedBilingualContent: isAr / lang===\'ar\' ternary and local {en,ar} object guard', () => {
  it('actually scanned real contentSources files (sanity check)', () => {
    expect(Object.keys(results).length).toBeGreaterThan(10);
  });

  it('every GRANDFATHERED_FILES / DOCUMENTED_EXCEPTIONS / LANGUAGE_CONTENT_ROOT_EXCEPTIONS entry is still a real contentSources file (list does not silently rot)', () => {
    const allFiles = new Set(allContentSourceFiles());
    const stale = [
      ...Object.keys(GRANDFATHERED_FILES),
      ...Object.keys(DOCUMENTED_EXCEPTIONS),
      ...Object.keys(LANGUAGE_CONTENT_ROOT_EXCEPTIONS),
    ].filter((f) => !allFiles.has(f));
    expect(stale).toEqual([]);
  });

  it('every GRANDFATHERED_FILES / DOCUMENTED_EXCEPTIONS entry still actually has a violation (remove it once resolved, don\'t leave stale entries)', () => {
    const noLongerViolating = [...Object.keys(GRANDFATHERED_FILES), ...Object.keys(DOCUMENTED_EXCEPTIONS)]
      .filter((f) => (results[f] || []).length === 0);
    expect(noLongerViolating).toEqual([]);
  });

  it('every LANGUAGE_CONTENT_ROOT_EXCEPTIONS file has EXACTLY as many violations as it names exports, and every one of them IS a documented root export -- proves this is a narrow, named-nodes-only allowance, not an open permission for the whole file', () => {
    for (const [file, exception] of Object.entries(LANGUAGE_CONTENT_ROOT_EXCEPTIONS)) {
      const violations = results[file] || [];
      const expectedCount = exception.exportNames.length;
      expect(violations.length, `${file}: expected exactly ${expectedCount} violation(s) (${exception.exportNames.join(', ')}), found ${violations.length}`).toBe(expectedCount);
      expect(violations.every((v) => v.allowed), `${file}'s violation(s) are not all the documented root exports -- something changed`).toBe(true);
    }
  });

  it('no NEW violation: outside GRANDFATHERED_FILES / DOCUMENTED_EXCEPTIONS, and outside each file\'s one allowed LANGUAGE_CONTENT_ROOT_EXCEPTIONS node', () => {
    const wholeFileAllowed = new Set([...Object.keys(GRANDFATHERED_FILES), ...Object.keys(DOCUMENTED_EXCEPTIONS)]);
    const newViolations = Object.entries(results)
      .filter(([file]) => !wholeFileAllowed.has(file))
      .flatMap(([file, violations]) => violations
        .filter((v) => !v.allowed)
        .map((v) => ({ file, kind: v.kind })));
    expect(newViolations).toEqual([]);
  });
});

describe('LANGUAGE_CONTENT_ROOT_EXCEPTIONS mechanism: proves the allowance is narrow, not file-wide (synthetic, independent of the real file\'s current contents)', () => {
  it('a second isAr ternary in the same file is still flagged as a real, unallowed violation, even alongside the documented root', async () => {
    const source = "export const IJAZAH_TEXT = { en: {}, ar: {} };\nconst isAr = true;\nconst x = isAr ? 'a' : 'b';\n";
    const { code } = await transformWithEsbuild(source, 'synthetic.js', { loader: 'js' });
    const ast = await parseAstAsync(code);
    const allowedObjectRootNodes = findNamedRootObjects(ast, ['IJAZAH_TEXT']);
    const violations = findViolations(ast, { allowedObjectRootNodes });
    expect(violations.filter((v) => !v.allowed)).toEqual([{ kind: 'isAr-ternary', allowed: false }]);
    expect(violations.filter((v) => v.allowed)).toHaveLength(1); // the documented root itself
  });

  it('a second, DIFFERENT binary {en,ar} object in the same file is still flagged as a real, unallowed violation, even alongside the documented root', async () => {
    const source = "export const IJAZAH_TEXT = { en: {}, ar: {} };\nconst SOMETHING_ELSE = { en: 'x', ar: 'y' };\n";
    const { code } = await transformWithEsbuild(source, 'synthetic.js', { loader: 'js' });
    const ast = await parseAstAsync(code);
    const allowedObjectRootNodes = findNamedRootObjects(ast, ['IJAZAH_TEXT']);
    const violations = findViolations(ast, { allowedObjectRootNodes });
    expect(violations.filter((v) => !v.allowed)).toEqual([{ kind: 'bilingual-object-literal', allowed: false }]);
    expect(violations.filter((v) => v.allowed)).toHaveLength(1); // the documented root itself
  });

  it('a nested nested {en,ar} object INSIDE the documented root is still flagged separately (only the outermost root node is allowed)', async () => {
    const source = 'export const IJAZAH_TEXT = { en: { nested: { en: 1, ar: 2 } }, ar: {} };\n';
    const { code } = await transformWithEsbuild(source, 'synthetic.js', { loader: 'js' });
    const ast = await parseAstAsync(code);
    const allowedObjectRootNodes = findNamedRootObjects(ast, ['IJAZAH_TEXT']);
    const violations = findViolations(ast, { allowedObjectRootNodes });
    expect(violations.filter((v) => !v.allowed)).toEqual([{ kind: 'bilingual-object-literal', allowed: false }]);
    expect(violations.filter((v) => v.allowed)).toHaveLength(1);
  });

  it('when the named export is absent, nothing is allowed (no silent match on the wrong node)', async () => {
    const source = "const SOMETHING_ELSE = { en: 'x', ar: 'y' };\n";
    const { code } = await transformWithEsbuild(source, 'synthetic.js', { loader: 'js' });
    const ast = await parseAstAsync(code);
    const allowedObjectRootNodes = findNamedRootObjects(ast, ['IJAZAH_TEXT']); // not present -> []
    expect(allowedObjectRootNodes).toEqual([]);
    const violations = findViolations(ast, { allowedObjectRootNodes });
    expect(violations).toEqual([{ kind: 'bilingual-object-literal', allowed: false }]);
  });

  it('two named exports in the same file are BOTH allowed independently (proves the plural exportNames mechanism itself, not just the single-name case)', async () => {
    const source = 'export const FIRST_TEXT = { en: {}, ar: {} };\nexport const SECOND_TEXT = { en: {}, ar: {} };\n';
    const { code } = await transformWithEsbuild(source, 'synthetic.js', { loader: 'js' });
    const ast = await parseAstAsync(code);
    const allowedObjectRootNodes = findNamedRootObjects(ast, ['FIRST_TEXT', 'SECOND_TEXT']);
    expect(allowedObjectRootNodes).toHaveLength(2);
    const violations = findViolations(ast, { allowedObjectRootNodes });
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.allowed)).toBe(true);
  });
});
