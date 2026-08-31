import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { QueryProvider } from '../context/QueryProvider';
import Register from '../pages/Register';

// Stage 2A (see docs/user-admin-auth-contract.md, Section 3): public
// registration must not show a role/account-type selector, and no
// caller-controlled role/accountType value - however it is smuggled in -
// may reach the registration API call. This is the required test proving
// spoofed input cannot change the role (mocked only at the api/authApi.js
// network boundary, the same level every other auth test in this suite
// mocks at - see AdminLogin.test.jsx/AdminAuthContext.test.jsx).

vi.mock('../api/authApi.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
}));

import * as authApi from '../api/authApi.js';

function renderRegister() {
  return render(
    <LangProvider>
      <QueryProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/register']}>
            <Routes>
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<div>Dashboard Placeholder</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryProvider>
    </LangProvider>,
  );
}

async function fillAndSubmit(user, { name = 'Jane Doe', email = 'jane@example.com', password = 'Sup3r-Str0ng-Pass!' } = {}) {
  await user.type(screen.getByLabelText('Full name'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /Create Account|Creating/ }));
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders no role/account-type selector at all', () => {
    renderRegister();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/account type/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/student/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/parent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/teacher/i)).not.toBeInTheDocument();
  });

  it('sends a registration payload with no role/accountType key at all', async () => {
    const user = userEvent.setup();
    authApi.registerUser.mockResolvedValue({ id: '1', name: 'Jane Doe', email: 'jane@example.com' });
    renderRegister();

    await fillAndSubmit(user);

    await waitFor(() => expect(authApi.registerUser).toHaveBeenCalledTimes(1));
    const payload = authApi.registerUser.mock.calls[0][0];
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('accountType');
    expect(payload).toEqual({ name: 'Jane Doe', email: 'jane@example.com', password: 'Sup3r-Str0ng-Pass!' });
  });

  it('ignores a spoofed role/accountType sitting in localStorage before submission', async () => {
    const user = userEvent.setup();
    // An attacker (or a leftover value from an old build) cannot influence
    // the payload this way - the form only ever reads its own controlled
    // `name`/`email`/`password` state, never localStorage, at submit time.
    localStorage.setItem('role', 'admin');
    localStorage.setItem('accountType', 'teacher');
    authApi.registerUser.mockResolvedValue({ id: '1', name: 'Jane Doe', email: 'jane@example.com' });
    renderRegister();

    await fillAndSubmit(user);

    await waitFor(() => expect(authApi.registerUser).toHaveBeenCalledTimes(1));
    const payload = authApi.registerUser.mock.calls[0][0];
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('accountType');
  });

  it('ignores a spoofed ?role=admin query string on the /register URL', async () => {
    const user = userEvent.setup();
    authApi.registerUser.mockResolvedValue({ id: '1', name: 'Jane Doe', email: 'jane@example.com' });
    render(
      <LangProvider>
        <QueryProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/register?role=admin&accountType=teacher']}>
              <Routes>
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element={<div>Dashboard Placeholder</div>} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryProvider>
      </LangProvider>,
    );

    await fillAndSubmit(user);

    await waitFor(() => expect(authApi.registerUser).toHaveBeenCalledTimes(1));
    const payload = authApi.registerUser.mock.calls[0][0];
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('accountType');
  });

  it('every account lands on the single generic Dashboard after registering - never a role-specific route', async () => {
    const user = userEvent.setup();
    // Even a legacy-shaped response that still claims role: 'admin' must
    // not change where the new account lands.
    authApi.registerUser.mockResolvedValue({ id: '1', name: 'Jane Doe', email: 'jane@example.com', role: 'admin' });
    renderRegister();

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText('Dashboard Placeholder')).toBeInTheDocument());
  });
});
