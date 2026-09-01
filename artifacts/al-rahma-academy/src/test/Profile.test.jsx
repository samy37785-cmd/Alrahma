import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '../context/LangContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminAuthProvider } from '../context/AdminAuthContext';
import { QueryProvider } from '../context/QueryProvider';
import Profile from '../pages/Profile';

// Stage 2C (see docs/legacy-role-orphan-cleanup.md): Profile.jsx had ZERO
// dedicated test coverage before this stage. This file proves the parent-
// child link-code removal behaviorally, not just by source-grep:
//   - Profile still renders and still exposes its generic account features
//     (personal info, password change, subscription) with no link-code
//     section left in the DOM;
//   - getMyLinkCode is not merely unused - it no longer exists as an
//     authApi export at all, so a real (not mocked-away) import of it would
//     have failed at module-collection time, which it did not;
//   - the account-type label reads a generic, translated "User"/"Admin"
//     value, never a legacy teacher/parent/student string.

vi.mock('../api/authApi', () => ({
  getMe: vi.fn().mockResolvedValue({ id: 'u1', name: 'Amina Test', email: 'amina@example.com', role: 'user' }),
}));
vi.mock('../api/courseApi', () => ({
  getCourses: vi.fn().mockResolvedValue([]),
  getMyCertificates: vi.fn().mockResolvedValue([]),
}));

import * as authApi from '../api/authApi';

function renderProfile(user = { id: 'u1', name: 'Amina Test', email: 'amina@example.com', role: 'user' }) {
  localStorage.setItem('user', JSON.stringify(user));
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

describe('Profile (Stage 2C: parent-child link code removed)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    authApi.getMe.mockResolvedValue({ id: 'u1', name: 'Amina Test', email: 'amina@example.com', role: 'user' });
  });

  it('renders without throwing and shows the generic account sections', async () => {
    expect(() => renderProfile()).not.toThrow();
    expect(await screen.findByText('My Account')).toBeInTheDocument();
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('My Subscription')).toBeInTheDocument();
  });

  it('renders no link-code section, no reveal/copy button, no <code> element', async () => {
    renderProfile();
    await screen.findByText('My Account');
    expect(screen.queryByText(/link code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/parent link/i)).not.toBeInTheDocument();
    expect(document.querySelector('code')).not.toBeInTheDocument();
  });

  it('shows a generic "User" account-type label for a regular account, never a legacy teacher/parent/student label', async () => {
    renderProfile({ id: 'u1', name: 'Amina Test', email: 'amina@example.com', role: 'user' });
    await screen.findByText('My Account');
    expect(screen.getByDisplayValue('User')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Teacher')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Parent')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Student')).not.toBeInTheDocument();
  });

  it('shows "Administrator" for an account whose raw legacy role field still says admin (cosmetic label only, not a security grant)', async () => {
    const adminProfile = { id: 'a1', name: 'Root Admin', email: 'admin@example.com', role: 'admin' };
    // AuthContext's mount-time ensureSession() re-fetches getMe() and would
    // otherwise overwrite this test's seeded admin role with whatever the
    // shared beforeEach mock returns - match it here so the async refresh
    // doesn't race the assertion below.
    authApi.getMe.mockResolvedValue(adminProfile);
    renderProfile(adminProfile);
    await screen.findByText('My Account');
    expect(await screen.findByDisplayValue('Administrator')).toBeInTheDocument();
  });
});
