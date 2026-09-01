import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminClassesTab from '../components/features/admin/AdminClassesTab';

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): this
// component had ZERO prior test coverage. It used to filter the eligible
// class-scheduling picker down to `users.filter(u => u.role === 'student')`
// - a legacy account-role concept the product no longer has. This proves
// the fix: every regular user account is eligible (no role-based
// eligibility is invented, since none is documented or provable from
// current data), and the copy reads "Participant", never "Student".

vi.mock('../api/classApi', () => ({
  getClasses:  vi.fn(),
  createClass: vi.fn(),
  deleteClass: vi.fn(),
}));

import * as classApi from '../api/classApi';

const USERS = [
  { _id: 'u1', name: 'Amina', email: 'amina@example.com', role: 'student' },
  { _id: 'u2', name: 'Yusuf', email: 'yusuf@example.com', role: 'teacher' },
  { _id: 'u3', name: 'Sara', email: 'sara@example.com', role: undefined },
];

function renderTab(users = USERS, overrides = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { users, onError: vi.fn(), ...overrides };
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <AdminClassesTab {...props} />
      </QueryClientProvider>,
    ),
    props,
  };
}

describe('AdminClassesTab (Stage 2C Final Corrective: no role-based eligibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classApi.getClasses.mockResolvedValue([]);
  });

  it('the scheduling picker offers every user regardless of role - "student"/"teacher"/undefined all included', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /Schedule Class/i }));

    expect(screen.getByRole('option', { name: /Amina/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Yusuf/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Sara/ })).toBeInTheDocument();
  });

  it('the picker and table label read "Participant", never "Student"', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: /Schedule Class/i }));

    // Both the form's <label> and the table's <th> now read "Participant".
    expect(screen.getAllByText('Participant').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Student', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.queryByText('Student', { selector: 'th' })).not.toBeInTheDocument();
    expect(screen.getByText('— Select participant —')).toBeInTheDocument();
  });

  it('scheduling a class with a non-"student"-role user succeeds - eligibility is not role-gated', async () => {
    const user = userEvent.setup();
    classApi.createClass.mockResolvedValue({ _id: 'c1' });
    const { container } = renderTab();
    await user.click(screen.getByRole('button', { name: /Schedule Class/i }));

    // Two <select>s exist once the form is open: the "Upcoming/All time"
    // filter (index 0) and the participant picker (index 1) - neither
    // label uses htmlFor/id association, so accessible-name lookup can't
    // distinguish them; select positionally instead. Same for the
    // datetime-local input, queried directly by type.
    await user.selectOptions(screen.getAllByRole('combobox')[1], 'u2');
    await user.type(screen.getByPlaceholderText('Tajweed lesson'), 'Arabic reading');
    await user.type(container.querySelector('input[type="datetime-local"]'), '2027-01-01T10:00');
    await user.click(screen.getByRole('button', { name: /^Schedule$/ }));

    expect(classApi.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ student: 'u2', title: 'Arabic reading' }),
      expect.anything(),
    );
  });
});
