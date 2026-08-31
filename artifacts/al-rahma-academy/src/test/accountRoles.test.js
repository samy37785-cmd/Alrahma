import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_ROLES,
  normalizeAccountRole,
  isRegularUser,
  isVerifiedAdminSession,
} from '../utils/accountRoles';

describe('normalizeAccountRole', () => {
  it('normalizes the current self-service value to user', () => {
    expect(normalizeAccountRole('user')).toBe('user');
  });

  it('normalizes every legacy regular-role value to user', () => {
    expect(normalizeAccountRole('teacher')).toBe('user');
    expect(normalizeAccountRole('parent')).toBe('user');
    expect(normalizeAccountRole('student')).toBe('user');
  });

  it('normalizes a missing/undefined/null role to user', () => {
    expect(normalizeAccountRole(undefined)).toBe('user');
    expect(normalizeAccountRole(null)).toBe('user');
    expect(normalizeAccountRole('')).toBe('user');
  });

  it('normalizes any unsupported/invalid value to user', () => {
    expect(normalizeAccountRole('superadmin')).toBe('user');
    expect(normalizeAccountRole('editor')).toBe('user');
    expect(normalizeAccountRole(123)).toBe('user');
    expect(normalizeAccountRole({ role: 'admin' })).toBe('user');
  });

  it('never returns admin, even when the regular account claims role: admin', () => {
    // This is the central security property of the contract: a regular
    // account response (or a spoofed one) claiming role: 'admin' must
    // NOT be treated as admin anywhere in the app. Admin can only be
    // proven by isVerifiedAdminSession() against a real AdminUser
    // session, never by this field.
    expect(normalizeAccountRole('admin')).toBe('user');
    expect(normalizeAccountRole('admin')).not.toBe(ACCOUNT_ROLES.ADMIN);
  });
});

describe('isRegularUser', () => {
  it('is true for every input, since normalizeAccountRole always resolves to user', () => {
    expect(isRegularUser('user')).toBe(true);
    expect(isRegularUser('teacher')).toBe(true);
    expect(isRegularUser('admin')).toBe(true);
    expect(isRegularUser(undefined)).toBe(true);
  });
});

describe('isVerifiedAdminSession', () => {
  it('is false when there is no AdminUser session', () => {
    expect(isVerifiedAdminSession(null)).toBe(false);
    expect(isVerifiedAdminSession(undefined)).toBe(false);
  });

  it('is true only when a real AdminUser profile object is present', () => {
    expect(isVerifiedAdminSession({ email: 'admin@example.com' })).toBe(true);
  });

  it('does not itself validate object shape - it trusts its caller to pass AdminAuthContext.adminUser only', () => {
    // This function only checks truthiness; it cannot know whether an
    // object came from a real admin login+MFA session or was fabricated
    // elsewhere. The actual security property is architectural: every
    // real call site in this app passes ONLY AdminAuthContext's
    // `adminUser` (populated exclusively by adminLogin/adminMfaVerify),
    // never a regular-user profile. This test documents that boundary
    // explicitly rather than silently assuming it.
    const notAnAdminSessionObject = { role: 'admin', name: 'Not Really Admin' };
    expect(isVerifiedAdminSession(notAnAdminSessionObject)).toBe(true);
  });
});

describe('ACCOUNT_ROLES', () => {
  it('exposes exactly the two supported account concepts', () => {
    expect(ACCOUNT_ROLES).toEqual({ USER: 'user', ADMIN: 'admin' });
  });

  it('is frozen (cannot be mutated at a call site)', () => {
    expect(Object.isFrozen(ACCOUNT_ROLES)).toBe(true);
  });
});
