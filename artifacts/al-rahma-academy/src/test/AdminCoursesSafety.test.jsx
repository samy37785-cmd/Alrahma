import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminCoursesTab from '../components/features/admin/AdminCoursesTab';
import { createCourse, deleteCourse, getAdminCourse, updateCourse } from '../api/courseApi';

vi.mock('../api/courseApi', () => ({
  createCourse: vi.fn(), deleteCourse: vi.fn(), getAdminCourse: vi.fn(), updateCourse: vi.fn(),
}));

// What the course list holds: the public catalogue's entry, which leaves out
// resources and every module's lessons.
const listEntry = {
  _id: 'course1', title: 'Course', description: 'Description', icon: '📘', level: 'Beginner',
  modules: [{ _id: 'm1', title: 'Module', summary: '', order: 0 }],
};

// The admin read of the same course: everything that is stored.
const fullCourse = {
  ...listEntry,
  updatedAt: '2026-10-01T10:00:00.000Z',
  resources: [{ type: 'link', label: 'Resource', url: 'https://example.com/resource' }],
  modules: [{
    _id: 'm1', title: 'Module', summary: '', order: 0, createdAt: '2026-09-01T00:00:00.000Z',
    lessons: [
      { _id: 'l1', title: 'Lesson', type: 'video', url: 'https://example.com/lesson', content: '', duration: '5 min', order: 0,
        resources: [{ type: 'pdf', label: 'Notes', url: 'https://example.com/notes.pdf' }] },
      { _id: 'l2', title: 'Reading', type: 'text', url: '', content: 'Lesson text', duration: '', order: 1, resources: [] },
    ],
  }],
};

const LOAD_ERROR = 'Could not load the complete course';

function setup(courses = [listEntry]) {
  const onError = vi.fn();
  const onCoursesChange = vi.fn();
  render(<AdminCoursesTab courses={courses} onCoursesChange={onCoursesChange} onError={onError} />);
  return { onError, onCoursesChange };
}

async function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  return screen.findByRole('button', { name: 'Save changes' });
}

describe('Admin course editing preserves existing content', () => {
  beforeEach(() => vi.resetAllMocks());

  it('fills the form from the admin read and sends every lesson and resource back with a small change', async () => {
    getAdminCourse.mockResolvedValue(fullCourse);
    updateCourse.mockResolvedValue({ ...fullCourse, title: 'New title' });
    const { onCoursesChange } = setup();
    await openEditor();
    expect(getAdminCourse).toHaveBeenCalledWith('course1');
    expect(screen.getByDisplayValue('Resource')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lesson')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lesson text')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(1));
    expect(updateCourse).toHaveBeenCalledWith('course1', {
      title: 'New title', description: 'Description', icon: '📘', level: 'Beginner',
      resources: fullCourse.resources, modules: fullCourse.modules,
      expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
    });
    await waitFor(() => expect(onCoursesChange).toHaveBeenCalled());
  });

  it('edits a course stored without resources or modules (the real catalogue) and saves them as empty lists', async () => {
    getAdminCourse.mockResolvedValue({
      _id: 'course1', title: 'Course', description: 'Description', icon: '📘', level: 'All levels',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    updateCourse.mockResolvedValue({});
    setup();
    await openEditor();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Better description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(1));
    expect(updateCourse.mock.calls[0][1]).toMatchObject({
      description: 'Better description', resources: [], modules: [], expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('treats a module without a lessons field in the admin read as having no lessons', async () => {
    getAdminCourse.mockResolvedValue({ ...fullCourse, modules: [{ _id: 'm1', title: 'Module', summary: '' }] });
    updateCourse.mockResolvedValue({});
    setup();
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(1));
    expect(updateCourse.mock.calls[0][1].modules).toEqual([{ _id: 'm1', title: 'Module', summary: '', lessons: [] }]);
  });

  it('does not start editing if the full record fails to load', async () => {
    getAdminCourse.mockRejectedValue(new Error('Network failure'));
    const { onError } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining(LOAD_ERROR)));
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(updateCourse).not.toHaveBeenCalled();
  });

  it.each([
    ['another course', { ...fullCourse, _id: 'different-course' }],
    ['resources that are not a list', { ...fullCourse, resources: 'x' }],
    ['modules that are not a list', { ...fullCourse, modules: {} }],
    ['lessons that are not a list', { ...fullCourse, modules: [{ title: 'Module', lessons: 'x' }] }],
    ['an empty module entry', { ...fullCourse, modules: [null] }],
    ['no title', { ...fullCourse, title: undefined }],
    ['an HTML page', '<!doctype html><html></html>'],
    ['nothing', null],
  ])('refuses to edit when the admin read returns %s', async (_label, response) => {
    getAdminCourse.mockResolvedValue(response);
    const { onError } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining(LOAD_ERROR)));
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(updateCourse).not.toHaveBeenCalled();
  });

  it('prevents submission while the complete record is loading', async () => {
    let resolveCourse;
    getAdminCourse.mockReturnValue(new Promise((resolve) => { resolveCourse = resolve; }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Add course' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    expect(createCourse).not.toHaveBeenCalled();
    resolveCourse(fullCourse);
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(deleteCourse).not.toHaveBeenCalled();
  });

  it('keeps the form and the edits when the server refuses a save because the course changed elsewhere', async () => {
    const message = 'This course was changed after you opened it, so your edits were not saved. Open it again to load the latest version.';
    getAdminCourse.mockResolvedValue(fullCourse);
    updateCourse.mockRejectedValue({ response: { status: 409, data: { message } } });
    const { onError, onCoursesChange } = setup();
    await openEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(message));
    expect(onCoursesChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('My edit');
  });

  it('a fresh open after a save sends the new version, not the one from before', async () => {
    getAdminCourse
      .mockResolvedValueOnce(fullCourse)
      .mockResolvedValueOnce({ ...fullCourse, title: 'Saved title', updatedAt: '2026-10-02T09:00:00.000Z' });
    updateCourse.mockResolvedValue({ ...fullCourse, title: 'Saved title', updatedAt: '2026-10-02T09:00:00.000Z' });
    setup();
    await openEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Saved title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Add course' });

    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(2));
    expect(updateCourse.mock.calls[1][1].expectedUpdatedAt).toBe('2026-10-02T09:00:00.000Z');
  });
});
