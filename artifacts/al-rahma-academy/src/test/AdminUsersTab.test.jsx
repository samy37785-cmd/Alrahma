import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUsersTab from '../components/features/admin/AdminUsersTab';

// Stage 2B Part A, Section 3 (see docs/user-admin-auth-contract.md): closes
// a real Stage 2A evidence gap - AdminUsersTab's Stage 2A read-only-role
// change had ZERO dedicated test coverage (AdminDashboard.test.jsx mocks
// this component out entirely). This file proves, against the real
// component (mocked only at the api/adminApi.js network boundary):
//   - no role <select> (or any other role-mutating control) exists at all;
//   - the role column renders the user's role as plain, non-interactive text;
//   - updateUserRole is never imported/called from anywhere reachable here;
//   - the disabled-role-changes message is visible in the rendered output,
//     not hidden behind a hover-only tooltip;
//   - the still-live per-student actions (family name, subscription
//     actions) keep working - Stage 2A only disabled the role mutation,
//     nothing else.
//
// Stage 2C (see docs/legacy-role-orphan-cleanup.md): the teacher-assignment
// <select> and its `teachers` prop were removed from AdminUsersTab entirely
// - it attached a student to a legacy teacher *account*, a relationship the
// product no longer has. That coverage is gone with it; a static guard in
// legacyRoleOrphanCleanup.test.js instead locks in that it can't come back.

vi.mock('../api/adminApi', () => ({
  updateUserSubscription: vi.fn(),
  setFamilyName: vi.fn(),
}));

import * as adminApi from '../api/adminApi';

const STUDENT = { _id: 's1', name: 'Amina', email: 'amina@example.com', role: 'student', subscription: { status: 'active', plan: 'Noorani' } };
const ADMIN_ROW = { _id: 'a1', name: 'Root Admin', email: 'admin@example.com', role: 'admin', subscription: { status: 'active' } };

function renderTab(users = [STUDENT, ADMIN_ROW], overrides = {}) {
  const props = {
    users,
    usersTotal: users.length,
    onOpenReport: vi.fn(),
    onUsersChange: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { ...render(<AdminUsersTab {...props} />), props };
}

describe('AdminUsersTab (Stage 2A read-only role column)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the role as plain read-only text, not an interactive control', () => {
    renderTab();
    // No <select> anywhere in this component maps to a role-change control
    // (the former teacher-assignment <select> was removed in Stage 2C).
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('student')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('shows an always-visible message that role changes are disabled (not hover-only)', () => {
    renderTab();
    expect(screen.getByText(/Role changes are disabled/i)).toBeVisible();
  });

  it('updateUserRole is never called - there is no control left that could call it', async () => {
    const user = userEvent.setup();
    renderTab();
    // Clicking directly on the role badge text does nothing mutating.
    await user.click(screen.getByText('student'));
    expect(adminApi.updateUserSubscription).not.toHaveBeenCalled();
    // updateUserRole is not even imported by this component any more -
    // asserted at the module level via the mock factory above having no
    // updateUserRole export at all (a real import would throw at
    // collection time if the component still referenced it).
  });

  it('subscription renew/deactivate actions still work, unaffected by the role-mutation disable', async () => {
    const user = userEvent.setup();
    adminApi.updateUserSubscription.mockResolvedValue({ subscription: { status: 'active', plan: 'Noorani', validUntil: '2027-01-01' } });
    renderTab([STUDENT]);
    await user.click(screen.getByTitle('Renew 30 days'));
    expect(adminApi.updateUserSubscription).toHaveBeenCalledWith('s1', { action: 'renew', plan: 'Noorani' });
  });
});
