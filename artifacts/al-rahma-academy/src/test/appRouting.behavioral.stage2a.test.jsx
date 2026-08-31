import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Stage 2B Part A, Section 5 (see docs/user-admin-auth-contract.md): closes
// a real Stage 2A evidence gap - appRouting.stage2a.test.js only proved the
// route table's SOURCE TEXT looked right (a static guard); it never proved
// the actual redirect/guard BEHAVIOR by rendering the real App. This file
// renders the real, full App component (mocked only at the api/*.js network
// boundary) and drives real browser-style navigation via window.history, so
// it exercises the real BrowserRouter + ProtectedRoute + AdminSessionGate +
// AdminLogin wiring end to end - not just their source text.

vi.mock('../api/authApi.js', () => ({
  loginUser:  vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
  getMe:      vi.fn().mockRejectedValue({ response: { status: 401 } }),
  updateMe:   vi.fn(),
}));
vi.mock('../api/adminAuthApi.js', () => ({
  adminLogin:      vi.fn(),
  adminMfaSetup:   vi.fn(),
  adminMfaConfirm: vi.fn(),
  adminMfaVerify:  vi.fn(),
  adminLogout:     vi.fn(),
}));

function goTo(path) {
  window.history.pushState({}, '', path);
}

describe('App.jsx real routing behavior (Stage 2A, behavioral - complements the static guard)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('/teacher renders the generic Dashboard, never TeacherDashboard', async () => {
    goTo('/teacher');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    // TeacherDashboard-only copy that Dashboard.jsx never renders.
    expect(screen.queryByText('Manage your students, track progress, and schedule live sessions.')).not.toBeInTheDocument();
  });

  it('/parent renders the generic Dashboard, never ParentDashboard', async () => {
    goTo('/parent');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    // ParentDashboard-only copy that Dashboard.jsx never renders.
    expect(screen.queryByText(/Monitor your children/i)).not.toBeInTheDocument();
  });

  it('/admin/login is reachable by an unauthenticated visitor - no redirect to /login, no circular guard', async () => {
    goTo('/admin/login');
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/admin/login');
    expect(screen.getByText('Admin Sign In')).toBeInTheDocument();
  });

  it('/admin denies an unauthenticated visitor - redirected to /admin/login, never rendering AdminDashboard', async () => {
    goTo('/admin');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/admin/login'));
    expect(screen.getByText('Admin Sign In')).toBeInTheDocument();
  });
});
