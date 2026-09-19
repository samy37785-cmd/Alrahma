// @vitest-environment node
//
// Arabic Cross-Page Shell Repair (2026-09-xx): these 9 files used to
// hardcode the FIRST <Breadcrumbs items={[...]}> entry's `label` as a
// literal English word (e.g. `{ label: 'Tools', to: '/tools' }`) instead of
// a translated t.nav.* value -- every non-English visitor, including
// Arabic, saw that one crumb in English regardless of the page's real
// language, no matter how complete the rest of the page's translation was.
// Fixed this phase (see each file's own diff); this guard keeps it fixed by
// forbidding a quoted string literal as the first item's `label`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(import.meta.dirname, '..');

const FILES = [
  'src/pages/About.jsx',
  'src/pages/Adhkar.jsx',
  'src/pages/Blog.jsx',
  'src/pages/CourseIjazah.jsx',
  'src/pages/CourseIslamicStudies.jsx',
  'src/pages/FAQ.jsx',
  'src/pages/HadithLibrary.jsx',
  'src/pages/TeacherProfile.jsx',
  'src/pages/BlogPost.jsx',
];

// Matches `<Breadcrumbs items={[{ label: '...'` or `label: "..."` -- a
// quoted string literal as the FIRST items-array entry's label, regardless
// of which word it names. A translated value (`label: t.nav.tools`,
// `label: siteT.nav.courses`, ...) is a MemberExpression/Identifier, never
// matched by this pattern.
const HARDCODED_FIRST_LABEL = /<Breadcrumbs\s+items=\{\[\{\s*label:\s*['"]/;

describe('breadcrumb parent-crumb i18n guard (Arabic Cross-Page Shell Repair)', () => {
  it.each(FILES)('%s: Breadcrumbs\' first item label is not a hardcoded string literal', (relPath) => {
    const source = readFileSync(join(SRC_ROOT, '..', relPath), 'utf8');
    expect(source).not.toMatch(HARDCODED_FIRST_LABEL);
  });

  it('sanity: the guard pattern actually matches the old hardcoded shape (not vacuously passing)', () => {
    const synthetic = "<Breadcrumbs items={[{ label: 'Tools', to: '/tools' }, { label: t.nav.hadith }]} />";
    expect(synthetic).toMatch(HARDCODED_FIRST_LABEL);
  });
});
