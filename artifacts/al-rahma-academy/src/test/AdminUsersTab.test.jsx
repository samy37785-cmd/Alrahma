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
// `u.role === 'student'`. Those two stay removed.
//
// Scope correction (see docs/current-project-status.md): the Plan/Status/
// Valid-Until columns and the +30d/Activate/Deactivate subscription
// controls are back — manual, non-gateway admin subscription activation is
// not an online card-gateway feature. PATCH /v1/admin/users/:id/
// subscription is live again.

vi.mock('../api/adminApi', () => ({
  updateUserSubscription: vi.fn(),
}));

import { updateUserSubscription } from '../api/adminApi';

const STUDENT = { _id: 's1', name: 'Amina', email: 'amina@example.com', role: 'student', subscription: { status: 'inactive' } };
const ADMIN_ROW = { _id: 'a1', name: 'Root Admin', email: 'admin@example.com', role: 'admin' };

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

describe('AdminUsersTab (Stage 2C Final Corrective: no Role or Family columns; scope correction: subscription controls restored)', () => {
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

  it('renders the Plan/Status/Valid Until columns and the +30d/Activate/Deactivate controls — manual admin subscription activation is not an online card-gateway feature', () => {
    renderTab();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Valid Until')).toBeInTheDocument();
    expect(screen.getAllByTitle('Renew 30 days').length).toBeGreaterThan(0);
    // STUDENT has subscription.status 'inactive' -> Activate; ADMIN_ROW has
    // no subscription object at all -> also treated as inactive -> Activate.
    expect(screen.getAllByTitle('Activate').length).toBe(2);
    expect(screen.queryByTitle('Deactivate')).not.toBeInTheDocument();
  });

  it('every row still shows name and email - the restored columns did not take other data down with them', () => {
    renderTab();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('amina@example.com')).toBeInTheDocument();
    expect(screen.getByText('Root Admin')).toBeInTheDocument();
  });

  it('the "view progress report" action still works', async () => {
    const user = userEvent.setup();
    const onOpenReport = vi.fn();
    renderTab([STUDENT], { onOpenReport });
    await user.click(screen.getByTitle('View progress report'));
    expect(onOpenReport).toHaveBeenCalledWith(STUDENT);
  });

  it('clicking Activate calls updateUserSubscription with action "activate" and updates local state via onUsersChange', async () => {
    const user = userEvent.setup();
    updateUserSubscription.mockResolvedValue({ subscription: { status: 'active', plan: 'Starter', validUntil: '2030-01-01' } });
    const onUsersChange = vi.fn();
    renderTab([STUDENT], { onUsersChange });

    await user.click(screen.getByTitle('Activate'));

    expect(updateUserSubscription).toHaveBeenCalledWith('s1', { action: 'activate', plan: 'Starter' });
    expect(onUsersChange).toHaveBeenCalled();
  });

  it('an active subscription shows Deactivate instead of Activate, and clicking it calls updateUserSubscription with action "deactivate"', async () => {
    const user = userEvent.setup();
    updateUserSubscription.mockResolvedValue({ subscription: { status: 'inactive' } });
    const activeStudent = { ...STUDENT, subscription: { status: 'active', plan: 'Starter', validUntil: '2030-01-01' } };
    renderTab([activeStudent]);

    expect(screen.queryByTitle('Activate')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Deactivate'));

    expect(updateUserSubscription).toHaveBeenCalledWith('s1', { action: 'deactivate', plan: undefined });
  });

  it('a failed subscription action calls onError with the server message', async () => {
    const user = userEvent.setup();
    updateUserSubscription.mockRejectedValue({ response: { data: { message: 'boom' } } });
    const onError = vi.fn();
    renderTab([STUDENT], { onError });

    await user.click(screen.getByTitle('Activate'));

    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('the empty-state row spans exactly 7 columns (# Name Email Plan Status Valid-Until Action)', () => {
    renderTab([]);
    const emptyCell = screen.getByText('No users yet.');
    expect(emptyCell).toHaveAttribute('colSpan', '7');
  });
});
