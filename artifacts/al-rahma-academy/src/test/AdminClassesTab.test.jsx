import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
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
//
// Classes are read, scheduled and deleted through the MFA admin API
// (/api/v1/admin/live-classes), never the regular-session /api/classes, and
// every class needs a teacher chosen from the existing teacher accounts.

vi.mock('../api/classApi', () => ({
  getClasses:       vi.fn(),
  createClass:      vi.fn(),
  deleteClass:      vi.fn(),
  adminGetClasses:  vi.fn(),
  adminCreateClass: vi.fn(),
  adminDeleteClass: vi.fn(),
  adminGetTeachers: vi.fn(),
}));

import * as classApi from '../api/classApi';

const USERS = [
  { _id: 'u1', name: 'Amina', email: 'amina@example.com', role: 'student' },
  { _id: 'u2', name: 'Yusuf', email: 'yusuf@example.com', role: 'teacher' },
  { _id: 'u3', name: 'Sara', email: 'sara@example.com', role: undefined },
];
const TEACHERS = [
  { _id: 't1', name: 'Ustadh Khalid', email: 'khalid@example.com' },
  { _id: 't2', name: 'Ustadha Maryam', email: 'maryam@example.com' },
];
const CLASS = {
  _id: 'c1', title: 'Tajweed lesson', startsAt: '2027-01-01T10:00:00.000Z', durationMin: 30, status: 'scheduled',
  student: { _id: 'u1', name: 'Amina' }, teacher: { _id: 't1', name: 'Ustadh Khalid' }, meetingUrl: '',
};

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

// Once the form is open there are three <select>s: the Upcoming/All filter
// (0), the participant picker (1) and the teacher picker (2).
const participantPicker = () => screen.getAllByRole('combobox')[1];
const teacherPicker = () => screen.getByLabelText('Teacher');

async function openForm(user) {
  await user.click(screen.getByRole('button', { name: /Schedule Class/i }));
  await waitFor(() => expect(classApi.adminGetTeachers).toHaveBeenCalled());
}

async function fillClass(user, container, { teacher, student = 'u2' } = {}) {
  await user.selectOptions(participantPicker(), student);
  if (teacher) {
    await waitFor(() => expect(within(teacherPicker()).getByRole('option', { name: /Ustadh Khalid/ })).toBeInTheDocument());
    await user.selectOptions(teacherPicker(), teacher);
  }
  await user.type(screen.getByPlaceholderText('Tajweed lesson'), 'Arabic reading');
  await user.type(container.querySelector('input[type="datetime-local"]'), '2027-01-01T10:00');
}

beforeEach(() => {
  vi.clearAllMocks();
  classApi.adminGetClasses.mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 });
  classApi.adminGetTeachers.mockResolvedValue(TEACHERS);
});

describe('AdminClassesTab (Stage 2C Final Corrective: no role-based eligibility)', () => {
  it('the scheduling picker offers every user regardless of role - "student"/"teacher"/undefined all included', async () => {
    const user = userEvent.setup();
    renderTab();
    await openForm(user);

    const picker = within(participantPicker());
    expect(picker.getByRole('option', { name: /Amina/ })).toBeInTheDocument();
    expect(picker.getByRole('option', { name: /Yusuf/ })).toBeInTheDocument();
    expect(picker.getByRole('option', { name: /Sara/ })).toBeInTheDocument();
  });

  it('the picker and table label read "Participant", never "Student"', async () => {
    const user = userEvent.setup();
    renderTab();
    await openForm(user);

    // Both the form's <label> and the table's <th> now read "Participant".
    expect(screen.getAllByText('Participant').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Student', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.queryByText('Student', { selector: 'th' })).not.toBeInTheDocument();
    expect(screen.getByText('— Select participant —')).toBeInTheDocument();
  });

  it('scheduling a class with a non-"student"-role user is sent to the admin API - eligibility is not role-gated in the UI', async () => {
    const user = userEvent.setup();
    classApi.adminCreateClass.mockResolvedValue({ _id: 'c1' });
    const { container } = renderTab();
    await openForm(user);
    await fillClass(user, container, { teacher: 't1', student: 'u2' });
    await user.click(screen.getByRole('button', { name: /^Schedule$/ }));

    expect(classApi.adminCreateClass).toHaveBeenCalledWith(
      expect.objectContaining({ student: 'u2', teacher: 't1', title: 'Arabic reading' }),
      expect.anything(),
    );
  });
});

describe('AdminClassesTab uses the MFA admin API', () => {
  it('lists classes through the admin API (never the regular-session /api/classes)', async () => {
    classApi.adminGetClasses.mockResolvedValue({ data: [CLASS], total: 1, page: 1, pages: 1 });
    renderTab();
    expect(await screen.findByText('Tajweed lesson')).toBeInTheDocument();
    expect(screen.getByText('Ustadh Khalid')).toBeInTheDocument();
    expect(classApi.adminGetClasses).toHaveBeenCalledWith({ upcoming: 1 });
    expect(classApi.getClasses).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Live Classes (1)' })).toBeInTheDocument();
  });

  it('deletes through the admin API', async () => {
    const user = userEvent.setup();
    classApi.adminGetClasses.mockResolvedValue({ data: [CLASS], total: 1, page: 1, pages: 1 });
    classApi.adminDeleteClass.mockResolvedValue({ message: 'Class deleted', id: 'c1' });
    renderTab();
    await user.click(await screen.findByRole('button', { name: 'Delete Tajweed lesson' }));
    await waitFor(() => expect(classApi.adminDeleteClass).toHaveBeenCalledWith('c1', expect.anything()));
    expect(classApi.deleteClass).not.toHaveBeenCalled();
  });
});

describe('AdminClassesTab requires a real teacher for every class', () => {
  it('the teacher picker offers the teacher accounts from the admin API, not the users list', async () => {
    const user = userEvent.setup();
    renderTab();
    await openForm(user);
    const picker = within(teacherPicker());
    await waitFor(() => expect(picker.getByRole('option', { name: /Ustadh Khalid/ })).toBeInTheDocument());
    expect(picker.getByRole('option', { name: /Ustadha Maryam/ })).toBeInTheDocument();
    expect(picker.queryByRole('option', { name: /Amina|Yusuf|Sara/ })).not.toBeInTheDocument();
    expect(picker.getByRole('option', { name: '— Select teacher —' })).toHaveValue('');
  });

  it('no teacher is pre-selected, and scheduling without one is stopped with a message', async () => {
    const user = userEvent.setup();
    const { container, props } = renderTab();
    await openForm(user);
    expect(teacherPicker()).toHaveValue('');
    await fillClass(user, container);
    await user.click(screen.getByRole('button', { name: /^Schedule$/ }));

    expect(props.onError).toHaveBeenCalledWith('Please choose the teacher who will give this class.');
    expect(classApi.adminCreateClass).not.toHaveBeenCalled();
  });

  it('after a refused try, choosing a teacher schedules the class and clears the message', async () => {
    const user = userEvent.setup();
    classApi.adminCreateClass.mockResolvedValue({ _id: 'c9' });
    const { container, props } = renderTab();
    await openForm(user);
    await fillClass(user, container);
    await user.click(screen.getByRole('button', { name: /^Schedule$/ }));
    expect(props.onError).toHaveBeenLastCalledWith('Please choose the teacher who will give this class.');

    await user.selectOptions(teacherPicker(), 't2');
    await user.click(screen.getByRole('button', { name: /^Schedule$/ }));
    await waitFor(() => expect(classApi.adminCreateClass).toHaveBeenCalledWith(
      expect.objectContaining({ teacher: 't2', student: 'u2' }), expect.anything(),
    ));
    await waitFor(() => expect(props.onError).toHaveBeenLastCalledWith(''));
  });

  it('with no teacher accounts it says so and cannot schedule', async () => {
    const user = userEvent.setup();
    classApi.adminGetTeachers.mockResolvedValue([]);
    renderTab();
    await openForm(user);
    expect(await screen.findByText(/There are no teacher accounts yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Schedule$/ })).toBeDisabled();
  });

  it('a failed teacher list is shown as a loading error, not as "no teacher accounts", and cannot schedule', async () => {
    const user = userEvent.setup();
    classApi.adminGetTeachers.mockRejectedValue(new Error('403'));
    renderTab();
    await openForm(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the teacher list/);
    expect(screen.queryByText(/There are no teacher accounts yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Schedule$/ })).toBeDisabled();
  });
});
