import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { QueryProvider } from '../context/QueryProvider';
import Profile from '../pages/Profile';

// Audit AR-03: the server now needs the current password to change the email.
// The personal-info form shows a current-password field (with a hint for
// Google sign-ups) only while the email differs from the saved one, and sends
// the password only then; saving the name alone works as before.

const USER = { id: 'u1', name: 'Amina Test', email: 'amina@example.com', role: 'user' };

vi.mock('../api/authApi', () => ({
  getMe: vi.fn().mockResolvedValue({ id: 'u1', name: 'Amina Test', email: 'amina@example.com', role: 'user' }),
  updateMe: vi.fn((data) => Promise.resolve({ _id: 'u1', name: data.name, email: data.email, role: 'user' })),
}));
vi.mock('../api/courseApi', () => ({
  getCourses: vi.fn().mockResolvedValue([]),
  getMyCertificates: vi.fn().mockResolvedValue([]),
}));

import * as authApi from '../api/authApi';

function renderProfile() {
  localStorage.setItem('user', JSON.stringify(USER));
  return render(
    <LangProvider>
      <QueryProvider>
        <AuthProvider>
          <AdminAuthProvider>
            <MemoryRouter initialEntries={['/profile']}>
              <Profile />
            </MemoryRouter>
          </AdminAuthProvider>
        </AuthProvider>
      </QueryProvider>
    </LangProvider>,
  );
}

const emailInput = () => document.getElementById('prof-email');
const passInput = () => document.getElementById('prof-email-pass');

beforeEach(() => { authApi.updateMe.mockClear(); localStorage.clear(); });

describe('Profile: changing the email needs the current password (AR-03)', () => {
  it('shows no extra field while the email is unchanged, and saves the name without a password', async () => {
    renderProfile();
    expect(passInput()).toBeNull();
    fireEvent.change(document.getElementById('prof-name'), { target: { value: 'Amina New' } });
    fireEvent.submit(emailInput().closest('form'));
    await waitFor(() => expect(authApi.updateMe).toHaveBeenCalledTimes(1));
    expect(authApi.updateMe.mock.calls[0][0]).toEqual({ name: 'Amina New', email: 'amina@example.com' });
  });

  it('a different case or surrounding spaces is not a change', () => {
    renderProfile();
    fireEvent.change(emailInput(), { target: { value: ' Amina@Example.com ' } });
    expect(passInput()).toBeNull();
  });

  it('a new email shows a required current-password field with its hint, and sends it', async () => {
    renderProfile();
    fireEvent.change(emailInput(), { target: { value: 'new@example.com' } });
    const pass = passInput();
    expect(pass).toBeTruthy();
    expect(pass.type).toBe('password');
    expect(pass.required).toBe(true);
    expect(screen.getByText(/Signed up with Google\?/)).toBeTruthy();
    expect(pass.getAttribute('aria-describedby')).toContain('prof-email-pass-hint');

    fireEvent.change(pass, { target: { value: 'Str0ngP@ssw0rd!' } });
    fireEvent.submit(emailInput().closest('form'));
    await waitFor(() => expect(authApi.updateMe).toHaveBeenCalledTimes(1));
    expect(authApi.updateMe.mock.calls[0][0]).toEqual({ name: 'Amina Test', email: 'new@example.com', currentPassword: 'Str0ngP@ssw0rd!' });
  });
});
