import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { QueryProvider } from '../context/QueryProvider';
import Login from '../pages/Login';

// Stage 2A (see docs/user-admin-auth-contract.md, Section 6): the regular
// /login page must always land on the single generic Dashboard - a legacy
// role value on the login response (teacher/parent/admin) must never route
// anywhere else. Real admins have a completely separate sign-in
// (/admin/login, covered in AdminLogin.test.jsx).

vi.mock('../api/authApi.js', () => ({
  loginUser:  vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
  getMe:      vi.fn(),
  updateMe:   vi.fn(),
}));

import * as authApi from '../api/authApi.js';

function renderLogin(initialEntries = ['/login']) {
  return render(
    <LangProvider>
      <QueryProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<div>Dashboard Placeholder</div>} />
              <Route path="/admin" element={<div>Admin Placeholder</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryProvider>
    </LangProvider>,
  );
}

describe('Login (Stage 2A: routing always lands on the generic Dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('a successful login with a legacy role: "teacher" response still lands on /dashboard, never /teacher', async () => {
    const user = userEvent.setup();
    authApi.loginUser.mockResolvedValue({ name: 'Jane', email: 'jane@example.com', role: 'teacher' });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: /Login|Logging/ }));

    await waitFor(() => expect(screen.getByText('Dashboard Placeholder')).toBeInTheDocument());
  });

  it('a successful login with a spoofed role: "admin" response still lands on /dashboard, never /admin', async () => {
    const user = userEvent.setup();
    authApi.loginUser.mockResolvedValue({ name: 'Spoofer', email: 'spoof@example.com', role: 'admin' });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'spoof@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.click(screen.getByRole('button', { name: /Login|Logging/ }));

    await waitFor(() => expect(screen.getByText('Dashboard Placeholder')).toBeInTheDocument());
    expect(screen.queryByText('Admin Placeholder')).not.toBeInTheDocument();
  });

  it('an already-logged-in visitor hitting /login is redirected straight to /dashboard', async () => {
    localStorage.setItem('user', JSON.stringify({ name: 'Jane', email: 'jane@example.com', role: 'admin' }));
    authApi.getMe.mockResolvedValue({ name: 'Jane', email: 'jane@example.com', role: 'admin' });
    renderLogin();
    await waitFor(() => expect(screen.getByText('Dashboard Placeholder')).toBeInTheDocument());
  });
});
