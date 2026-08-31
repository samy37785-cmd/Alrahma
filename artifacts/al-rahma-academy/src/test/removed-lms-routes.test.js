import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { navFor, bottomNavFor } from '../components/layout/dashboardNav';

// Guard for Stage 2 Batch 1 (feat/prune-attendance-homework): the
// Attendance and Homework pages were preview-only mocks (own in-code
// PreviewBanner, never connected to a real backend) and were deleted along
// with their routes, nav entries, and quick links. This locks that removal
// in so it can't silently regress — it checks routes/navigation/page files
// only. It intentionally does NOT forbid the words "attendance"/"homework"
// anywhere in the app: both remain legitimate as data/labels elsewhere
// (e.g. a per-record attendance mark in a teacher's student notes, or an
// "Attendance" certificate type) — only the deleted pages and their route
// paths are guarded here.

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');

// Any of these exact, quoted route-path strings would mean a route,
// <Link>, or nav entry to the deleted pages still exists somewhere it
// shouldn't. Checked as literal substrings (not a regex over the whole
// tree) so this stays independent of formatting/line numbers.
const REMOVED_PATH_STRINGS = ["'/attendance'", '"/attendance"', "'/homework'", '"/homework"'];

function readSrcFile(relPath) {
  return readFileSync(join(srcRoot, relPath), 'utf8');
}

function assertNoRemovedPathStrings(label, source) {
  for (const needle of REMOVED_PATH_STRINGS) {
    expect(source.includes(needle), `${label} should not contain ${needle}`).toBe(false);
  }
}

describe('removed Attendance/Homework pages stay removed', () => {
  it('AttendancePage.jsx and HomeworkPage.jsx no longer exist', () => {
    expect(existsSync(join(srcRoot, 'pages', 'AttendancePage.jsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'pages', 'HomeworkPage.jsx'))).toBe(false);
  });

  it('App.jsx registers no /attendance or /homework route (and imports neither page)', () => {
    const source = readSrcFile('App.jsx');
    assertNoRemovedPathStrings('App.jsx', source);
    expect(source).not.toMatch(/AttendancePage/);
    expect(source).not.toMatch(/HomeworkPage/);
  });

  it('dashboardNav.js source contains no /attendance or /homework path string', () => {
    assertNoRemovedPathStrings('dashboardNav.js', readSrcFile('components/layout/dashboardNav.js'));
  });

  // Stage 2A (see docs/user-admin-auth-contract.md) collapsed navFor()/
  // bottomNavFor() from a 3-role (admin/teacher/parent) signature down to a
  // single isAdmin boolean - every non-admin account normalizes to `user`.
  it('navFor() returns no /attendance or /homework entry, for any role', () => {
    for (const isAdmin of [true, false]) {
      const items = navFor(isAdmin, 0).filter((i) => i.to);
      const paths = items.map((i) => i.to);
      expect(paths).not.toContain('/attendance');
      expect(paths).not.toContain('/homework');
    }
  });

  it('bottomNavFor() returns no /attendance or /homework entry, for any role', () => {
    for (const isAdmin of [true, false]) {
      const items = bottomNavFor(isAdmin, 0).filter((i) => i.to);
      const paths = items.map((i) => i.to);
      expect(paths).not.toContain('/attendance');
      expect(paths).not.toContain('/homework');
    }
  });

  it('TeacherDashboard.jsx has no active quick link to /attendance or /homework', () => {
    assertNoRemovedPathStrings('TeacherDashboard.jsx', readSrcFile('pages/TeacherDashboard.jsx'));
  });

  it('ParentDashboard.jsx has no active quick link to /attendance or /homework', () => {
    assertNoRemovedPathStrings('ParentDashboard.jsx', readSrcFile('pages/ParentDashboard.jsx'));
  });
});
