import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUsersTab from '../components/features/admin/AdminUsersTab';

// Stage 2B Part A, Section 3 (see docs/user-admin-auth-contract.md): closed
// a Stage 2A evidence gap - AdminUsersTab had zero dedicated test coverage.
//
// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md) removed
// the Role column and the Family column entirely (see AdminUsersTab.jsx's
// own header comment): the Role column showed the raw, untrusted backend
// `role` field as if it were product truth, and the Family column was an
// undocumented orphan of the deleted parent/student account model gated on
// `u.role === 'student'`. This file is rewritten to prove both are
// actually gone from the rendered output - not just that their old
// controls are non-interactive - and that the still-live subscription
// actions are unaffected.

vi.mock('../api/adminApi', () => ({
  updateUserSubscription: vi.fn(),
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

describe('AdminUsersTab (Stage 2C Final Corrective: no Role or Family columns)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders no Role column at all - no raw role text, no role-change control, no role header cell', () => {
    renderTab();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('student')).not.toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Role')).not.toBeInTheDocument();
    expect(screen.queryByText(/Role changes are disabled/i)).not.toBeInTheDocument();
  });

  it('renders no Family column at all - the field was an undocumented orphan of the deleted account-role model', () => {
    renderTab();
    expect(screen.queryByText('Family')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('—')).not.toBeInTheDocument();
  });

  it('every row still shows name, email, plan, status, and valid-until - the deleted columns did not take other data down with them', () => {
    renderTab();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('amina@example.com')).toBeInTheDocument();
    expect(screen.getByText('Noorani')).toBeInTheDocument();
    expect(screen.getByText('Root Admin')).toBeInTheDocument();
  });

  it('subscription renew/deactivate actions still work, unaffected by the removed columns', async () => {
    const user = userEvent.setup();
    adminApi.updateUserSubscription.mockResolvedValue({ subscription: { status: 'active', plan: 'Noorani', validUntil: '2027-01-01' } });
    renderTab([STUDENT]);
    await user.click(screen.getByTitle('Renew 30 days'));
    expect(adminApi.updateUserSubscription).toHaveBeenCalledWith('s1', { action: 'renew', plan: 'Noorani' });
  });

  it('the empty-state row spans exactly 7 columns (# Name Email Plan Status Valid-Until Action), matching the 2 columns removed', () => {
    renderTab([]);
    const emptyCell = screen.getByText('No users yet.');
    expect(emptyCell).toHaveAttribute('colSpan', '7');
  });
});
