import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WishlistButton from '../components/ui/WishlistButton';

// Feature Sprint 3: reusable heart-toggle used on real course cards
// (Dashboard.jsx's CourseCard) — must not navigate the enclosing <Link>.

vi.mock('../api/wishlistApi.js', () => ({
  getWishlist: vi.fn(),
  addToWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  clearWishlist: vi.fn(),
}));

import { getWishlist, addToWishlist, removeFromWishlist } from '../api/wishlistApi.js';

function renderButton(courseId = 'course-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WishlistButton courseId={courseId} />
    </QueryClientProvider>,
  );
}

describe('WishlistButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows an unfilled heart and "Add to wishlist" label when the course is not wishlisted', async () => {
    getWishlist.mockResolvedValue({ courses: [] });
    renderButton('course-1');

    await waitFor(() => expect(screen.getByRole('button', { name: /add to wishlist/i })).toBeInTheDocument());
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a filled heart and "Remove from wishlist" label when the course is already wishlisted', async () => {
    getWishlist.mockResolvedValue({ courses: [{ course: { _id: 'course-1' } }] });
    renderButton('course-1');

    await waitFor(() => expect(screen.getByRole('button', { name: /remove from wishlist/i })).toBeInTheDocument());
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking an unwishlisted course calls addToWishlist with the courseId', async () => {
    getWishlist.mockResolvedValue({ courses: [] });
    addToWishlist.mockResolvedValue({ courses: [{ course: { _id: 'course-42' } }] });
    renderButton('course-42');

    const btn = await screen.findByRole('button', { name: /add to wishlist/i });
    await userEvent.click(btn);

    expect(addToWishlist.mock.calls[0][0]).toBe('course-42');
    expect(removeFromWishlist).not.toHaveBeenCalled();
  });

  it('clicking an already-wishlisted course calls removeFromWishlist with the courseId', async () => {
    getWishlist.mockResolvedValue({ courses: [{ course: { _id: 'course-42' } }] });
    removeFromWishlist.mockResolvedValue({ courses: [] });
    renderButton('course-42');

    const btn = await screen.findByRole('button', { name: /remove from wishlist/i });
    await userEvent.click(btn);

    expect(removeFromWishlist.mock.calls[0][0]).toBe('course-42');
    expect(addToWishlist).not.toHaveBeenCalled();
  });

  it('clicking does not bubble/navigate the enclosing link', async () => {
    getWishlist.mockResolvedValue({ courses: [] });
    addToWishlist.mockResolvedValue({ courses: [] });
    const parentClick = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <div onClick={parentClick}>
          <WishlistButton courseId="course-1" />
        </div>
      </QueryClientProvider>,
    );

    const btn = await screen.findByRole('button', { name: /add to wishlist/i });
    await userEvent.click(btn);

    expect(parentClick).not.toHaveBeenCalled();
  });
});
