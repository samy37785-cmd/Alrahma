import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminReviewsTab from '../components/features/admin/AdminReviewsTab';

// Feature Sprint 2: the admin moderation queue — previously moderateReview()
// existed on the backend with no way to discover which review IDs needed
// moderating (no admin listing endpoint), and no frontend consumed it at all.

vi.mock('../api/reviewApi.js', () => ({
  moderateReview: vi.fn(),
}));

import { moderateReview } from '../api/reviewApi.js';

const review = (overrides = {}) => ({
  _id: 'rev-1',
  student: { name: 'Amina' },
  teacher: { name: 'Sami' },
  rating: 5,
  title: '',
  body: 'Excellent tutor',
  status: 'pending',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('AdminReviewsTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('empty state: shows a message when there are no reviews', () => {
    render(<AdminReviewsTab reviews={[]} reviewsTotal={0} onReviewsChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText(/no reviews to show/i)).toBeInTheDocument();
  });

  it('renders review rows with student, subject, rating, body and status', () => {
    render(<AdminReviewsTab reviews={[review()]} reviewsTotal={1} onReviewsChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Sami')).toBeInTheDocument();
    expect(screen.getByText('Excellent tutor')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('★★★★★')).toBeInTheDocument();
  });

  it('only pending reviews show approve/reject action buttons', () => {
    render(
      <AdminReviewsTab
        reviews={[review({ _id: 'r1', status: 'pending' }), review({ _id: 'r2', status: 'approved' })]}
        reviewsTotal={2}
        onReviewsChange={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getAllByText('✓')).toHaveLength(1);
    expect(screen.getAllByText('✗')).toHaveLength(1);
  });

  it('approving a review calls moderateReview and updates local state via onReviewsChange', async () => {
    moderateReview.mockResolvedValue({ review: review({ status: 'approved' }) });
    const onReviewsChange = vi.fn();
    render(<AdminReviewsTab reviews={[review()]} reviewsTotal={1} onReviewsChange={onReviewsChange} onError={vi.fn()} />);

    await userEvent.click(screen.getByText('✓'));

    expect(moderateReview).toHaveBeenCalledWith('rev-1', { status: 'approved' });
    expect(onReviewsChange).toHaveBeenCalled();
    const updater = onReviewsChange.mock.calls[0][0];
    expect(updater([review()])[0].status).toBe('approved');
  });

  it('rejecting a review calls moderateReview with status rejected', async () => {
    moderateReview.mockResolvedValue({ review: review({ status: 'rejected' }) });
    render(<AdminReviewsTab reviews={[review()]} reviewsTotal={1} onReviewsChange={vi.fn()} onError={vi.fn()} />);

    await userEvent.click(screen.getByText('✗'));

    expect(moderateReview).toHaveBeenCalledWith('rev-1', { status: 'rejected' });
  });

  it('a failed moderation call surfaces the error via onError instead of throwing', async () => {
    moderateReview.mockRejectedValue({ response: { data: { message: 'Insufficient permissions' } } });
    const onError = vi.fn();
    render(<AdminReviewsTab reviews={[review()]} reviewsTotal={1} onReviewsChange={vi.fn()} onError={onError} />);

    await userEvent.click(screen.getByText('✓'));

    expect(onError).toHaveBeenCalledWith('Insufficient permissions');
  });

  it('the status filter narrows the visible rows without refetching', async () => {
    render(
      <AdminReviewsTab
        reviews={[review({ _id: 'r1', status: 'pending' }), review({ _id: 'r2', status: 'approved', student: { name: 'Yusuf' } })]}
        reviewsTotal={2}
        onReviewsChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Yusuf')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'approved');

    expect(screen.queryByText('Amina')).not.toBeInTheDocument();
    expect(screen.getByText('Yusuf')).toBeInTheDocument();
  });
});
