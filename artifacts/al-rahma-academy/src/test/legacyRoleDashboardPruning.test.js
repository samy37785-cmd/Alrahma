import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Stage 2B Part B guard (see docs/legacy-role-dashboard-pruning.md): locks
// in the file deletions and the legacy-compatibility redirects so they
// can't silently regress. Of the 5-file manifest, only 3 were actually
// deleted here - TeacherDashboard.jsx, StudentModal.jsx, AdminStaffTab.jsx.
// ParentDashboard.jsx and ChildModal.jsx were left BLOCKED (see that doc's
// Part B §9) and are intentionally NOT asserted absent below.

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');
const read = (relPath) => readFileSync(join(srcRoot, relPath), 'utf8');

describe('deleted files no longer exist', () => {
  it('TeacherDashboard.jsx, StudentModal.jsx, AdminStaffTab.jsx are gone', () => {
    expect(existsSync(join(srcRoot, 'pages', 'TeacherDashboard.jsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'features', 'teacher', 'StudentModal.jsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'features', 'admin', 'AdminStaffTab.jsx'))).toBe(false);
  });

  it('ParentDashboard.jsx and ChildModal.jsx were intentionally NOT deleted (BLOCKED, see the pruning doc)', () => {
    expect(existsSync(join(srcRoot, 'pages', 'ParentDashboard.jsx'))).toBe(true);
    expect(existsSync(join(srcRoot, 'components', 'features', 'parent', 'ChildModal.jsx'))).toBe(true);
  });
});

describe('no source file imports the deleted files any more', () => {
  it('App.jsx has no import/lazy-import of TeacherDashboard.jsx', () => {
    const source = read('App.jsx');
    expect(source).not.toMatch(/import\(['"]\.\/pages\/TeacherDashboard['"]\)/);
    expect(source).not.toMatch(/from ['"].*TeacherDashboard['"]/);
  });

  it('AdminDashboard.jsx has no import of AdminStaffTab.jsx, no staff tab entry, and no staff tabpanel', () => {
    const source = read('pages/AdminDashboard.jsx');
    expect(source).not.toMatch(/AdminStaffTab/);
    expect(source).not.toMatch(/key:\s*'staff'/);
    expect(source).not.toMatch(/tabpanel-staff/);
    expect(source).not.toMatch(/setActiveTab\('staff'\)/);
  });

  it('nothing left in src/ imports StudentModal.jsx (its only importer, TeacherDashboard.jsx, is gone)', () => {
    expect(existsSync(join(srcRoot, 'pages', 'TeacherDashboard.jsx'))).toBe(false);
  });
});

describe('/teacher and /parent are legacy-compatibility redirects, not role dashboards', () => {
  const appSource = read('App.jsx');

  it('App.jsx registers /teacher and /parent as plain redirects to /dashboard', () => {
    expect(appSource).toMatch(/<Route path="\/teacher" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
    expect(appSource).toMatch(/<Route path="\/parent" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
  });

  it('neither redirect route is wrapped in a role-based guard (no role= prop usage remains)', () => {
    expect(appSource).not.toMatch(/role="teacher"/);
    expect(appSource).not.toMatch(/role="parent"/);
  });
});

describe('AdminDashboard shell and its surviving tabs are intact', () => {
  it('AdminDashboard.jsx still registers exactly the 9 surviving tabs (staff removed, none of the others touched)', () => {
    const source = read('pages/AdminDashboard.jsx');
    const tabKeys = [...source.matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1]);
    expect(tabKeys).toEqual([
      'overview', 'users', 'courses', 'payments', 'trials',
      'newsletter', 'classes', 'reviews', 'community',
    ]);
  });

  it('AdminUsersTab, AdminPaymentsTab, AdminTrialsTab, AdminNewsletterTab are still imported (not touched by this pruning)', () => {
    const source = read('pages/AdminDashboard.jsx');
    expect(source).toMatch(/import AdminUsersTab/);
    expect(source).toMatch(/import AdminPaymentsTab/);
    expect(source).toMatch(/import AdminTrialsTab/);
    expect(source).toMatch(/import AdminNewsletterTab/);
  });
});
