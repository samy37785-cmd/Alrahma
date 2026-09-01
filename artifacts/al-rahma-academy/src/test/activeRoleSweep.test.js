import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md), Part C
// item 15 + Part F: a real, programmatic sweep of EVERY .js/.jsx file
// under src/ - not a hand-picked list of files. The prior static guard
// (legacyRoleOrphanCleanup.test.js) checked specific named files one at a
// time; this is the correction the task itself called out: a test titled
// "no import remains" must actually fail if that import reappears
// ANYWHERE in src, not just in the one file someone remembered to check.
//
// Scope: only `test/` is excluded wholesale (mocks/fixtures there
// legitimately write literal role strings for testing purposes - that is
// the allowlist, and it is exactly this one directory, not per-file
// guesswork). Everywhere else in src/ is scanned. Comments are stripped
// before matching (both block and same-line `//` comments) so historical/
// explanatory comments don't trip the guard - only real code does.

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'test' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (['.js', '.jsx'].includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

// Strips /* block */ comments first (they can span lines), then strips a
// trailing `// ...` on each remaining line. Deliberately simple - this
// codebase does not put the patterns under test inside string/template
// literals containing `//` (e.g. URLs), which is the one case this
// approach can't distinguish from a real comment.
function stripComments(source) {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

const files = walk(srcRoot).map((f) => ({ path: f, rel: relative(srcRoot, f), code: stripComments(readFileSync(f, 'utf8')) }));

describe('active-code sweep: no account-role comparison survives anywhere in src (excluding test/)', () => {
  const ROLE_COMPARISON = /\brole\s*===\s*['"](student|teacher|parent)['"]/;

  it(`scanned at least 100 real source files (sanity check that the walk actually ran)`, () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files.map((f) => f.rel))('%s has no active `role === \'student\'/\'teacher\'/\'parent\'` comparison', (rel) => {
    const file = files.find((f) => f.rel === rel);
    expect(file.code).not.toMatch(ROLE_COMPARISON);
  });
});

describe('active-code sweep: no dead dashboard-role i18n keys or legacy dashboard labels survive anywhere in src', () => {
  const DEAD_KEYS = /\b(studentDashboard|teacherDashboard|parentDashboard)\b/;

  it.each(files.map((f) => f.rel))('%s references no studentDashboard/teacherDashboard/parentDashboard key', (rel) => {
    const file = files.find((f) => f.rel === rel);
    expect(file.code).not.toMatch(DEAD_KEYS);
  });
});

describe('active-code sweep: no orphaned admin-role-management symbols survive anywhere in src', () => {
  const DEAD_SYMBOLS = /\b(listTeachers|updateUserRole|setFamilyName|adminCreateUser|assignTeacher)\b/;

  it.each(files.map((f) => f.rel))('%s references none of the removed admin role-management exports', (rel) => {
    const file = files.find((f) => f.rel === rel);
    expect(file.code).not.toMatch(DEAD_SYMBOLS);
  });
});

describe('active-code sweep: the fail-open isVerifiedAdminSession(adminUser) call shape never returns', () => {
  it.each(files.map((f) => f.rel))('%s does not call isVerifiedAdminSession(adminUser) (the old fail-open signature)', (rel) => {
    const file = files.find((f) => f.rel === rel);
    expect(file.code).not.toMatch(/isVerifiedAdminSession\(\s*adminUser\s*\)/);
  });
});

describe('active-code sweep: no deleted-page path is imported from anywhere in src', () => {
  const DELETED_IMPORT_PATTERNS = [
    /from\s+['"][^'"]*\/ParentDashboard['"]/,
    /from\s+['"][^'"]*\/ChildModal['"]/,
    /from\s+['"][^'"]*\/TeacherDashboard['"]/,
    /from\s+['"][^'"]*\/StudentModal['"]/,
    /from\s+['"][^'"]*\/AdminStaffTab['"]/,
    /from\s+['"][^'"]*\/teacherApi['"]/,
    /from\s+['"][^'"]*\/parentApi['"]/,
  ];

  it.each(files.map((f) => f.rel))('%s imports none of the deleted pages/components/API clients', (rel) => {
    const file = files.find((f) => f.rel === rel);
    for (const pattern of DELETED_IMPORT_PATTERNS) {
      expect(file.code).not.toMatch(pattern);
    }
  });
});
