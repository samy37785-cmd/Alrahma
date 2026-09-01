import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_ROLES,
  ADMIN_SESSION_STATUS,
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
  // Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): this
  // function's contract changed from Boolean(adminUser) to
  // sessionStatus === 'verified'. The old contract was fail-OPEN - any
  // truthy object (forged, stale, or a completely unrelated shape) made
  // this return true, as the old version of this describe block used to
  // document and assert. The new contract is fail-CLOSED: only the
  // 'verified' string - reachable exclusively via a real server round trip
  // in AdminAuthContext - returns true. Presence of ANY object, including
  // a perfectly real-looking cached adminUser, is irrelevant to this
  // function now; it doesn't even take one as an argument any more.

  it('is false for "checking" - an unverified cached profile is NOT proof', () => {
    expect(isVerifiedAdminSession(ADMIN_SESSION_STATUS.CHECKING)).toBe(false);
  });

  it('is false for "unauthenticated"', () => {
    expect(isVerifiedAdminSession(ADMIN_SESSION_STATUS.UNAUTHENTICATED)).toBe(false);
  });

  it('is false for null/undefined/garbage input - fails closed on anything unrecognized', () => {
    expect(isVerifiedAdminSession(null)).toBe(false);
    expect(isVerifiedAdminSession(undefined)).toBe(false);
    expect(isVerifiedAdminSession('forged-adminUser-object')).toBe(false);
    expect(isVerifiedAdminSession(true)).toBe(false);
  });

  it('is true ONLY for the exact "verified" status', () => {
    expect(isVerifiedAdminSession(ADMIN_SESSION_STATUS.VERIFIED)).toBe(true);
  });
});

describe('ADMIN_SESSION_STATUS', () => {
  it('exposes exactly the three session states', () => {
    expect(ADMIN_SESSION_STATUS).toEqual({
      CHECKING: 'checking',
      VERIFIED: 'verified',
      UNAUTHENTICATED: 'unauthenticated',
    });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ADMIN_SESSION_STATUS)).toBe(true);
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
