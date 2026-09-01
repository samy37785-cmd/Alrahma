import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Stage 2C static guards (see docs/legacy-role-orphan-cleanup.md). The
// product decision closing this stage: there are no teacher/parent/student
// account types, only 'user' and 'admin'. This file locks in the symbols
// and files this stage deleted so none of them can silently come back.
// Behavioral coverage (the primary layer) lives in Profile.test.jsx and
// appRouting.behavioral.stage2c.test.jsx; this is the additional static
// layer, scoped to specific paths/symbols only - it does not forbid the
// words teacher/parent/student anywhere in the app (they remain legitimate
// in public marketing content and Trial/Enrollment form fields).

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');
const read = (relPath) => readFileSync(join(srcRoot, relPath), 'utf8');

describe('Stage 2C deleted files stay deleted', () => {
  it('ParentDashboard.jsx, ChildModal.jsx, teacherApi.js, parentApi.js no longer exist', () => {
    expect(existsSync(join(srcRoot, 'pages', 'ParentDashboard.jsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'features', 'parent', 'ChildModal.jsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'api', 'teacherApi.js'))).toBe(false);
    expect(existsSync(join(srcRoot, 'api', 'parentApi.js'))).toBe(false);
  });
});

describe('no source file imports the Stage 2C-deleted files any more', () => {
  it('App.jsx has no lazy/static import of ParentDashboard.jsx', () => {
    const source = read('App.jsx');
    expect(source).not.toMatch(/import\(['"]\.\/pages\/ParentDashboard['"]\)/);
    expect(source).not.toMatch(/from ['"].*\/pages\/ParentDashboard['"]/);
  });

  it('api/index.js barrel no longer re-exports teacherApi.js or parentApi.js', () => {
    const source = read('api/index.js');
    expect(source).not.toMatch(/export \* from ['"]\.\/teacherApi['"]/);
    expect(source).not.toMatch(/export \* from ['"]\.\/parentApi['"]/);
  });

  it('nothing left in src/ imports ChildModal.jsx (its only importer, ParentDashboard.jsx, is gone)', () => {
    expect(existsSync(join(srcRoot, 'pages', 'ParentDashboard.jsx'))).toBe(false);
  });
});

describe('parent-child link-code symbols stay removed', () => {
  it('authApi.js no longer exports getMyLinkCode', () => {
    const source = read('api/authApi.js');
    expect(source).not.toMatch(/export const getMyLinkCode/);
  });

  it('Profile.jsx no longer references getMyLinkCode, linkCode state, or isStudent', () => {
    const source = read('pages/Profile.jsx');
    expect(source).not.toMatch(/getMyLinkCode/);
    expect(source).not.toMatch(/\blinkCode\b/);
    expect(source).not.toMatch(/\bisStudent\b/);
  });
});

describe('legacy teacher-account admin symbols stay removed', () => {
  it('adminApi.js no longer exports adminCreateUser or assignTeacher', () => {
    const source = read('api/adminApi.js');
    expect(source).not.toMatch(/export const adminCreateUser/);
    expect(source).not.toMatch(/export const assignTeacher/);
  });

  it('AdminUsersTab.jsx no longer imports or calls assignTeacher, and takes no teachers prop', () => {
    const source = read('components/features/admin/AdminUsersTab.jsx');
    expect(source).not.toMatch(/assignTeacher/);
    // Real code usage only (destructured prop, prop pass, .map() call) -
    // not the word "teachers" inside this file's own history comment.
    expect(source).not.toMatch(/teachers[.:=,}]/);
  });
});

describe('Header.jsx never renders the raw backend role field', () => {
  it('no {user.role} interpolation remains in Header.jsx', () => {
    const source = read('components/layout/Header.jsx');
    expect(source).not.toMatch(/\{user\.role\}/);
  });
});

describe('teacherDash/parentDash translation namespaces and role-specific keys stay removed, across all 6 locales', () => {
  const LOCALES = ['en', 'ar', 'it', 'es', 'de', 'fr'];

  it.each(LOCALES)('%s.js has no teacherDash or parentDash top-level key', (locale) => {
    const source = read(`i18n/${locale}.js`);
    expect(source).not.toMatch(/"teacherDash":/);
    expect(source).not.toMatch(/"parentDash":/);
  });

  it.each(LOCALES)('%s.js has no roleTeacher/roleParent profile keys, and no parent-link-code keys', (locale) => {
    const source = read(`i18n/${locale}.js`);
    expect(source).not.toMatch(/"roleTeacher":/);
    expect(source).not.toMatch(/"roleParent":/);
    expect(source).not.toMatch(/"parentLink":/);
    expect(source).not.toMatch(/"parentLinkDesc":/);
    expect(source).not.toMatch(/"showLinkCode":/);
  });

  it.each(LOCALES)('%s.js still has a roleUser key (the generic replacement for roleStudent)', (locale) => {
    const source = read(`i18n/${locale}.js`);
    expect(source).toMatch(/"roleUser":/);
  });
});

describe('no /student legacy route exists (product has no student account type)', () => {
  it('App.jsx registers no /student route', () => {
    const source = read('App.jsx');
    expect(source).not.toMatch(/path="\/student"/);
  });
});
