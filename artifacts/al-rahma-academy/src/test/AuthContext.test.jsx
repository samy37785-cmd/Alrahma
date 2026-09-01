import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { QueryProvider } from '../context/QueryProvider';

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): closes
// a real gap - the account-role contract (accountRoles.js's
// normalizeAccountRole()) was documented but never actually APPLIED at any
// of AuthContext's real data boundaries before this stage. `user.role`
// could still literally hold whatever a legacy/spoofed response claimed
// (admin/student/teacher/parent/garbage). AuthContext.jsx now normalizes
// at every single boundary a profile can enter its state through - cached-
// profile restoration, login, registration, getMe/ensureSession, and
// updateProfile - via one shared `persist()` funnel. This file proves each
// boundary directly, and had zero prior dedicated coverage.

vi.mock('../api/authApi', () => ({
  loginUser:    vi.fn(),
  registerUser: vi.fn(),
  logoutUser:   vi.fn(),
  getMe:        vi.fn(),
  updateMe:     vi.fn(),
}));

import * as authApi from '../api/authApi';

function Consumer() {
  const ctx = useAuth();
  return (
    <div>
      <span data-testid="role">{ctx.user?.role ?? 'none'}</span>
      <span data-testid="name">{ctx.user?.name ?? 'none'}</span>
      <button onClick={() => ctx.login({ email: 'a@b.com', password: 'x' }).catch(() => {})}>login</button>
      <button onClick={() => ctx.register({ name: 'New', email: 'a@b.com', password: 'x' }).catch(() => {})}>register</button>
      <button onClick={() => ctx.updateProfile({ name: 'Updated' }).catch(() => {})}>update</button>
      <button onClick={() => ctx.ensureSession()}>ensure</button>
    </div>
  );
}

function renderConsumer() {
  return render(<QueryProvider><AuthProvider><Consumer /></AuthProvider></QueryProvider>);
}

describe('AuthContext: normalizeAccountRole applied at every data boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('cached-profile restoration (mount)', () => {
    it.each(['user', 'student', 'teacher', 'parent', 'admin', undefined, null, '', 'garbage'])(
      'a cached profile with role %p normalizes to "user" on mount',
      (rawRole) => {
        localStorage.setItem('user', JSON.stringify({ name: 'Cached', email: 'c@example.com', role: rawRole }));
        authApi.getMe.mockResolvedValue({ name: 'Cached', email: 'c@example.com', role: rawRole });
        renderConsumer();
        expect(screen.getByTestId('role').textContent).toBe('user');
      },
    );

    it('the normalized value is what gets written back to localStorage too, once the mount-time ensureSession() round trip completes, not just the in-memory state', async () => {
      localStorage.setItem('user', JSON.stringify({ name: 'Cached', email: 'c@example.com', role: 'admin' }));
      authApi.getMe.mockResolvedValue({ name: 'Cached', email: 'c@example.com', role: 'admin' });
      renderConsumer();
      // Cached restoration normalizes in-memory immediately...
      expect(screen.getByTestId('role').textContent).toBe('user');
      // ...and the mount-time ensureSession()->getMe()->persist() round trip
      // (since a cached profile exists) re-writes the normalized value back
      // to localStorage too, once that async call resolves.
      await waitFor(() => expect(JSON.parse(localStorage.getItem('user')).role).toBe('user'));
    });
  });

  describe('login() response', () => {
    it.each(['student', 'teacher', 'parent', 'admin', undefined])(
      'a login response claiming role %p is normalized to "user"',
      async (rawRole) => {
        authApi.loginUser.mockResolvedValue({ name: 'Jane', email: 'jane@example.com', role: rawRole });
        renderConsumer();
        fireEvent.click(screen.getByText('login'));
        await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('user'));
      },
    );
  });

  describe('register() response', () => {
    it.each(['student', 'teacher', 'parent', 'admin'])(
      'a registration response claiming role %p (however it got there) is normalized to "user"',
      async (rawRole) => {
        authApi.registerUser.mockResolvedValue({ name: 'New', email: 'a@b.com', role: rawRole });
        renderConsumer();
        fireEvent.click(screen.getByText('register'));
        await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('user'));
      },
    );
  });

  describe('getMe()/ensureSession() response', () => {
    it('a getMe() response claiming role: "admin" is normalized to "user" - regular auth can never yield admin', async () => {
      localStorage.setItem('user', JSON.stringify({ name: 'Old', email: 'x@example.com', role: 'user' }));
      authApi.getMe.mockResolvedValue({ name: 'Refreshed', email: 'x@example.com', role: 'admin' });
      renderConsumer();
      await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Refreshed'));
      expect(screen.getByTestId('role').textContent).toBe('user');
    });
  });

  describe('updateProfile() response', () => {
    it('an updateMe() response claiming role: "teacher" is normalized to "user"', async () => {
      authApi.updateMe.mockResolvedValue({ name: 'Updated', email: 'a@b.com', role: 'teacher' });
      renderConsumer();
      fireEvent.click(screen.getByText('update'));
      await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Updated'));
      expect(screen.getByTestId('role').textContent).toBe('user');
    });
  });

  it('a null profile (logout/no session) is passed through as null, not coerced into a fake user object', () => {
    authApi.getMe.mockRejectedValue({ response: { status: 401 } });
    renderConsumer();
    expect(screen.getByTestId('role').textContent).toBe('none');
  });
});
