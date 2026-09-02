import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Stage 2C (see docs/legacy-role-orphan-cleanup.md): closes two behavioral
// gaps left after Stage 2B's appRouting.behavioral.stage2a.test.jsx -
//   1. That file only proved /teacher and /parent land on /dashboard's
//      route; it never waited long enough to see what happens next for an
//      UNAUTHENTICATED visitor. /dashboard is itself wrapped in
//      ProtectedRoute, so an unauthenticated visitor should keep going and
//      land on /login, not silently stop at /dashboard. This proves that
//      full chain end to end, with no redirect loop.
//   2. Nothing had yet proven the public teacher directory and an
//      individual teacher profile stay reachable by an unauthenticated
//      visitor after this stage's account-model cleanup - they are public
//      marketing pages, unrelated to the deleted legacy teacher *account*
//      concept, and must not require auth.

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

describe('App.jsx real routing behavior (Stage 2C, behavioral)', () => {
  // App.jsx route-splits every page behind React.lazy(). The first time a
  // given chunk is imported in this worker, Vitest/vite-node has to
  // transform and evaluate the module graph (Teachers.jsx alone pulls in
  // the 11-profile TEACHERS dataset, Header, Footer, Breadcrumbs and
  // useSEO). That one-time cost is normally invisible, but when this file
  // runs as part of the full suite — competing with dozens of other
  // concurrently-running test files for CPU — it can occasionally exceed a
  // single waitFor's timeout, even though the same test is fast in
  // isolation. Paying that cost here, outside any timed assertion, removes
  // the flake at its source instead of papering over it with a bigger
  // number (see docs/legacy-role-orphan-cleanup.md's Stage 2C section for
  // why this file exists at all).
  beforeAll(async () => {
    await Promise.all([import('../pages/Teachers'), import('../pages/TeacherProfile')]);
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('an unauthenticated visitor to /teacher ends up at /login, not stuck on /dashboard - no redirect loop', async () => {
    goTo('/teacher');
    render(<App />);
    // /teacher -> /dashboard (unconditional Navigate) -> ProtectedRoute
    // confirms no session -> /login. Wait for the FINAL hop, not the
    // intermediate one.
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 3000 });
    expect(screen.queryByText('Manage your students, track progress, and schedule live sessions.')).not.toBeInTheDocument();
  });

  it('an unauthenticated visitor to /parent ends up at /login, not stuck on /dashboard - no redirect loop', async () => {
    goTo('/parent');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/login'), { timeout: 3000 });
    expect(screen.queryByText(/Monitor your children/i)).not.toBeInTheDocument();
  });

  it('the public teacher directory (/academy/teachers) is reachable without authentication', async () => {
    goTo('/academy/teachers');
    render(<App />);
    // Wait for the actual Teachers page heading, not just "some <h1>
    // exists somewhere" — the Suspense fallback has no heading, so this
    // still specifically proves the lazy chunk resolved and rendered.
    await screen.findByRole('heading', { level: 1, name: /our qualified tutors/i }, { timeout: 8000 });
    expect(window.location.pathname).toBe('/academy/teachers');
    expect(screen.queryByText('Admin Sign In')).not.toBeInTheDocument();
  });

  it('an individual teacher profile (/academy/teachers/:id) is reachable without authentication', async () => {
    goTo('/academy/teachers/1');
    render(<App />);
    await waitFor(() => expect(screen.getByText('سامي محمود عبد العال')).toBeInTheDocument(), { timeout: 8000 });
    expect(window.location.pathname).toBe('/academy/teachers/1');
  });
});
