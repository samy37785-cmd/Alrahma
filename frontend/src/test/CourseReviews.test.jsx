import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourseReviews from '../components/features/courses/CourseReviews';

// Course Reviews — the final dormant-feature completion in this series
// (Notifications, Reviews-for-teachers, Wishlist, and now Course Reviews):
// the backend (createReview/getCourseReviews) already worked, but had no
// frontend anywhere, and getCourseReviews didn't even return an average/
// distribution (only reviews/total/page/pages) — extended alongside this UI.

vi.mock('../api/reviewApi.js', () => ({
  getCourseReviews: vi.fn(),
  createReview: vi.fn(),
}));

import { getCourseReviews, createReview } from '../api/reviewApi.js';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '../context/AuthContext';

function renderComponent(courseId = 'course-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CourseReviews courseId={courseId} />
    </QueryClientProvider>,
  );
}

const emptyStats = { reviews: [], total: 0, avg: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

describe('CourseReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { _id: 'u1', name: 'Student' } });
  });

  it('loading state: shows a loading message before the query resolves', async () => {
    let resolveFetch;
    getCourseReviews.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    renderComponent();

    expect(screen.getByText(/loading reviews/i)).toBeInTheDocument();
    resolveFetch(emptyStats);
    await waitFor(() => expect(screen.queryByText(/loading reviews/i)).not.toBeInTheDocument());
  });

  it('error state: shows a retry option when the fetch fails', async () => {
    getCourseReviews.mockRejectedValue(new Error('Network error'));
    renderComponent();

    await waitFor(() => expect(screen.getByText(/couldn't load reviews/i)).toBeInTheDocument());
    const retryBtn = screen.getByRole('button', { name: /try again/i });

    getCourseReviews.mockResolvedValue(emptyStats);
    await userEvent.click(retryBtn);
    await waitFor(() => expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument());
  });

  it('empty state: shows "no reviews yet" and a 0.0 average with an empty distribution', async () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    renderComponent();

    await waitFor(() => expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument());
    expect(screen.getByText('0.0')).toBeInTheDocument();
    expect(screen.getByText('0 reviews')).toBeInTheDocument();
  });

  it('successful fetch: renders the average, count, distribution bars, and each review', async () => {
    getCourseReviews.mockResolvedValue({
      reviews: [
        { _id: 'r1', rating: 5, title: 'Excellent', body: 'Loved it', student: { name: 'Amina' }, createdAt: new Date().toISOString() },
        { _id: 'r2', rating: 4, title: '', body: 'Pretty good', student: { name: 'Yusuf' }, createdAt: new Date().toISOString() },
      ],
      total: 2, avg: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
    });
    renderComponent();

    await waitFor(() => expect(screen.getByText('4.5')).toBeInTheDocument());
    expect(screen.getByText('2 reviews')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('Loved it')).toBeInTheDocument();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Yusuf')).toBeInTheDocument();
    expect(screen.getByText('Pretty good')).toBeInTheDocument();
  });

  it('a review with no reviewer name populated falls back to "Anonymous"', async () => {
    getCourseReviews.mockResolvedValue({
      reviews: [{ _id: 'r1', rating: 3, title: '', body: 'ok', student: null, createdAt: new Date().toISOString() }],
      total: 1, avg: 3, count: 1, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 },
    });
    renderComponent();

    await waitFor(() => expect(screen.getByText('Anonymous')).toBeInTheDocument());
  });

  it('shows a "Load more" button when more reviews exist than are loaded, and requests a bigger page on click', async () => {
    getCourseReviews.mockResolvedValue({
      reviews: [{ _id: 'r1', rating: 5, title: '', body: 'x', student: { name: 'A' }, createdAt: new Date().toISOString() }],
      total: 8, avg: 5, count: 8, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 8 },
    });
    renderComponent();

    const loadMoreBtn = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      const lastCall = getCourseReviews.mock.calls.at(-1);
      expect(lastCall[1].limit).toBeGreaterThan(5);
    });
  });

  it('no "Load more" button when every review is already loaded', async () => {
    getCourseReviews.mockResolvedValue({
      reviews: [{ _id: 'r1', rating: 5, title: '', body: 'x', student: { name: 'A' }, createdAt: new Date().toISOString() }],
      total: 1, avg: 5, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
    });
    renderComponent();

    await waitFor(() => expect(screen.getByText('x')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('submit review: requires both a rating and a body, and calls createReview with the real courseId', async () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    createReview.mockResolvedValue({ review: { _id: 'new1', status: 'pending' } });
    renderComponent('course-77');

    await userEvent.click(await screen.findByRole('button', { name: /write a review/i }));

    const submitBtn = screen.getByRole('button', { name: /submit review/i });
    expect(submitBtn).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    expect(submitBtn).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/share your experience/i), 'Really enjoyed this course');
    expect(submitBtn).not.toBeDisabled();

    await userEvent.click(submitBtn);

    expect(createReview).toHaveBeenCalledWith({ courseId: 'course-77', rating: 4, title: undefined, body: 'Really enjoyed this course' });
    await waitFor(() => expect(screen.getByText(/pending approval/i)).toBeInTheDocument());
  });

  it('submit review: an optional title is included when provided', async () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    createReview.mockResolvedValue({ review: { _id: 'new1', status: 'pending' } });
    renderComponent('course-77');

    await userEvent.click(await screen.findByRole('button', { name: /write a review/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Rate 5 stars' }));
    await userEvent.type(screen.getByPlaceholderText(/title/i), 'Loved it');
    await userEvent.type(screen.getByPlaceholderText(/share your experience/i), 'Body text');
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }));

    expect(createReview).toHaveBeenCalledWith({ courseId: 'course-77', rating: 5, title: 'Loved it', body: 'Body text' });
  });

  it('API failure on submit: shows an error and keeps the form open for retry', async () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    createReview.mockRejectedValue(new Error('Network error'));
    renderComponent();

    await userEvent.click(await screen.findByRole('button', { name: /write a review/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Rate 3 stars' }));
    await userEvent.type(screen.getByPlaceholderText(/share your experience/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() => expect(screen.getByText(/couldn't submit your review/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument();
  });

  it('duplicate review (409): shows a distinct "already reviewed" message', async () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    createReview.mockRejectedValue({ response: { status: 409, data: { message: 'You have already submitted a review' } } });
    renderComponent();

    await userEvent.click(await screen.findByRole('button', { name: /write a review/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Rate 2 stars' }));
    await userEvent.type(screen.getByPlaceholderText(/share your experience/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() => expect(screen.getByText(/already reviewed this course/i)).toBeInTheDocument());
  });

  it('cancel button closes the form without submitting', async () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    renderComponent();

    await userEvent.click(await screen.findByRole('button', { name: /write a review/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByRole('button', { name: /write a review/i })).toBeInTheDocument();
    expect(createReview).not.toHaveBeenCalled();
  });

  it('no logged-in user: does not show a "Write a review" button', async () => {
    useAuth.mockReturnValue({ user: null });
    getCourseReviews.mockResolvedValue(emptyStats);
    renderComponent();

    await waitFor(() => expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /write a review/i })).not.toBeInTheDocument();
  });

  it('no courseId: the query is disabled and never calls the API', () => {
    getCourseReviews.mockResolvedValue(emptyStats);
    renderComponent(null);

    expect(getCourseReviews).not.toHaveBeenCalled();
  });
});
