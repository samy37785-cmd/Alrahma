import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { navFor, bottomNavFor, roleLabel } from '../components/layout/dashboardNav';

// Stage 2A (see docs/user-admin-auth-contract.md, Section 7): navigation
// has exactly one non-admin shape now - there is no active teacher/parent/
// student branch anywhere, and `isAdmin` is sourced exclusively from the
// real AdminUser + MFA session (AdminAuthContext), never from the regular
// account's own `role` field (AuthContext).

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');
const read = (relPath) => readFileSync(join(srcRoot, relPath), 'utf8');

describe('dashboardNav.js has a single (isAdmin, ...) shape - no teacher/parent branch', () => {
  it('navFor()/bottomNavFor() take (isAdmin, unreadCount) - no isTeacher/isParent parameters', () => {
    expect(navFor.length).toBe(2);
    expect(bottomNavFor.length).toBe(2);
  });

  it('roleLabel() takes (user, isAdmin, roles) - no isTeacher/isParent parameters', () => {
    expect(roleLabel.length).toBe(3);
  });

  it('navFor(true, ...)/navFor(false, ...) never return a /teacher or /parent link', () => {
    for (const isAdmin of [true, false]) {
      const paths = navFor(isAdmin, 0).filter((i) => i.to).map((i) => i.to);
      expect(paths).not.toContain('/teacher');
      expect(paths).not.toContain('/parent');
    }
  });
});

describe('isAdmin is sourced from AdminAuthContext, never from the regular account role, across nav-consuming files', () => {
  const NAV_FILES = [
    'components/layout/Header.jsx',
    'components/layout/DashboardLayout.jsx',
    'components/ui/CommandPalette.jsx',
  ];

  it.each(NAV_FILES)('%s imports useAdminAuth and does not destructure isAdmin/isTeacher/isParent from useAuth()', (relPath) => {
    const source = read(relPath);
    expect(source).toMatch(/useAdminAuth/);
    // A regex over the actual useAuth() destructure call (if the file still
    // calls useAuth() at all - CommandPalette.jsx no longer does, having
    // moved entirely onto useAdminAuth), not the whole file, so an
    // unrelated later isAdmin usage (correctly sourced from useAdminAuth)
    // doesn't produce a false failure.
    const useAuthCall = source.match(/const \{[^}]*\} = useAuth\(\);/);
    if (useAuthCall) expect(useAuthCall[0]).not.toMatch(/isAdmin|isTeacher|isParent/);
  });

  it('AuthContext.jsx no longer exposes isAdmin/isTeacher/isParent on its context value', () => {
    const source = read('context/AuthContext.jsx');
    expect(source).not.toMatch(/isAdmin:\s*user/);
    expect(source).not.toMatch(/isTeacher:/);
    expect(source).not.toMatch(/isParent:/);
  });

  it('AdminAuthContext.jsx is the single source of a real isAdmin, derived from isVerifiedAdminSession(sessionStatus) - a real server-verified state, not the merely-cached adminUser object (Stage 2C Final Corrective, see docs/user-admin-auth-contract.md)', () => {
    const source = read('context/AdminAuthContext.jsx');
    expect(source).toMatch(/isAdmin:\s*isVerifiedAdminSession\(sessionStatus\)/);
    expect(source).not.toMatch(/isAdmin:\s*isVerifiedAdminSession\(adminUser\)/);
  });
});
