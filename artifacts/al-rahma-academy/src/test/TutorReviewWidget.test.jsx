import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TutorReviewWidget } from '../components/features/dashboard/TutorReviewWidget';

// Feature Sprint 2: real review submission + real average rating for the
// student's actual assigned tutor (user.teacher — a real User._id), replacing
// the previous complete absence of any real review UI anywhere in the app.
// Mocks only the api/ network boundary, same convention as every other hook/
// widget test in this suite.

vi.mock('../api/reviewApi.js', () => ({
  getTeacherReviews: vi.fn(),
  createReview: vi.fn(),
}));

import { getTeacherReviews, createReview } from '../api/reviewApi.js';

function renderWidget(teacherId = 'teacher-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TutorReviewWidget teacherId={teacherId} />
    </QueryClientProvider>,
  );
}

describe('TutorReviewWidget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loading state: shows a loading message before the rating query resolves', async () => {
    let resolveFetch;
    getTeacherReviews.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    renderWidget();

    expect(screen.getByText(/loading rating/i)).toBeInTheDocument();
    resolveFetch({ reviews: [], total: 0, avg: 0, count: 0 });
    await waitFor(() => expect(screen.queryByText(/loading rating/i)).not.toBeInTheDocument());
  });

  it('empty state: "No reviews yet" when the teacher has no approved reviews', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 0, avg: 0, count: 0 });
    renderWidget();

    await waitFor(() => expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument());
  });

  it('successful fetch: shows the real average and review count', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 3, avg: 4.6667, count: 3 });
    renderWidget();

    await waitFor(() => expect(screen.getByText(/4\.7 \(3 reviews\)/)).toBeInTheDocument());
  });

  it('error state: shows a fallback message and a retry button when the rating fails to load, without crashing the submit flow', async () => {
    getTeacherReviews.mockRejectedValue(new Error('Network error'));
    renderWidget();

    await waitFor(() => expect(screen.getByText(/couldn't load rating/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /rate your tutor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('error state: clicking retry re-fetches the rating', async () => {
    getTeacherReviews.mockRejectedValueOnce(new Error('Network error'));
    getTeacherReviews.mockResolvedValueOnce({ reviews: [], total: 0, avg: 0, count: 0 });
    renderWidget();

    await waitFor(() => expect(screen.getByText(/couldn't load rating/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument());
  });

  it('recent reviews: renders a list of the teacher\'s reviews returned by the API', async () => {
    getTeacherReviews.mockResolvedValue({
      reviews: [
        { _id: 'r1', rating: 5, body: 'Wonderful tutor' },
        { _id: 'r2', rating: 4, body: 'Very patient' },
      ],
      total: 2, avg: 4.5, count: 2,
    });
    renderWidget();

    await waitFor(() => expect(screen.getByText('Wonderful tutor')).toBeInTheDocument());
    expect(screen.getByText('Very patient')).toBeInTheDocument();
  });

  it('recent reviews: "Show more reviews" is shown when total exceeds the loaded page and requests a bigger page', async () => {
    getTeacherReviews.mockResolvedValue({
      reviews: [{ _id: 'r1', rating: 5, body: 'Wonderful tutor' }],
      total: 5, avg: 5, count: 5,
    });
    renderWidget();

    const moreBtn = await screen.findByRole('button', { name: /show more reviews/i });
    await userEvent.click(moreBtn);

    await waitFor(() => expect(getTeacherReviews.mock.calls.at(-1)[1]).toMatchObject({ limit: 6 }));
  });

  it('recent reviews: sort dropdown is shown once there is more than one review and requests the chosen sort', async () => {
    getTeacherReviews.mockResolvedValue({
      reviews: [
        { _id: 'r1', rating: 5, body: 'a' },
        { _id: 'r2', rating: 3, body: 'b' },
      ],
      total: 2, avg: 4, count: 2,
    });
    renderWidget();

    const select = await screen.findByLabelText(/sort reviews/i);
    await userEvent.selectOptions(select, 'rating_desc');

    await waitFor(() => expect(getTeacherReviews.mock.calls.at(-1)[1]).toMatchObject({ sort: 'rating_desc' }));
  });

  it('recent reviews: sort dropdown is not shown when there is only one (or zero) reviews', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [{ _id: 'r1', rating: 5, body: 'a' }], total: 1, avg: 5, count: 1 });
    renderWidget();

    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument());
    expect(screen.queryByLabelText(/sort reviews/i)).not.toBeInTheDocument();
  });

  it('submit review: opens the form, requires both a rating and body, and calls createReview with the real teacherId', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 0, avg: 0, count: 0 });
    createReview.mockResolvedValue({ review: { _id: 'r1', status: 'pending' } });
    renderWidget('teacher-42');

    await userEvent.click(await screen.findByRole('button', { name: /rate your tutor/i }));

    const submitBtn = screen.getByRole('button', { name: /submit review/i });
    expect(submitBtn).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Rate 5 stars' }));
    expect(submitBtn).toBeDisabled(); // body still empty

    await userEvent.type(screen.getByPlaceholderText(/tell us about your experience/i), 'Wonderful tutor');
    expect(submitBtn).not.toBeDisabled();

    await userEvent.click(submitBtn);

    expect(createReview).toHaveBeenCalledWith({ teacherId: 'teacher-42', rating: 5, body: 'Wonderful tutor' });
    await waitFor(() => expect(screen.getByText(/pending approval/i)).toBeInTheDocument());
  });

  it('API failure on submit: shows an error message and keeps the form open for retry', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 0, avg: 0, count: 0 });
    createReview.mockRejectedValue(new Error('Network error'));
    renderWidget();

    await userEvent.click(await screen.findByRole('button', { name: /rate your tutor/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 stars' }));
    await userEvent.type(screen.getByPlaceholderText(/tell us about your experience/i), 'Good session');
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() => expect(screen.getByText(/couldn't submit your review/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument();
  });

  it('already reviewed: a 409 response shows a distinct "already reviewed" message instead of a generic error', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 1, avg: 5, count: 1 });
    createReview.mockRejectedValue({ response: { status: 409, data: { message: 'You have already submitted a review' } } });
    renderWidget();

    await userEvent.click(await screen.findByRole('button', { name: /rate your tutor/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Rate 3 stars' }));
    await userEvent.type(screen.getByPlaceholderText(/tell us about your experience/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /submit review/i }));

    await waitFor(() => expect(screen.getByText(/already reviewed your tutor/i)).toBeInTheDocument());
  });

  it('submit review: shows a live character counter for the review body', async () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 0, avg: 0, count: 0 });
    renderWidget();

    await userEvent.click(await screen.findByRole('button', { name: /rate your tutor/i }));
    expect(screen.getByText('0/2000')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/tell us about your experience/i), 'Great');
    expect(screen.getByText('5/2000')).toBeInTheDocument();
  });

  it('no teacherId (no assigned tutor yet): the query is disabled and never calls the API', () => {
    getTeacherReviews.mockResolvedValue({ reviews: [], total: 0, avg: 0, count: 0 });
    renderWidget(null);

    expect(getTeacherReviews).not.toHaveBeenCalled();
  });
});
