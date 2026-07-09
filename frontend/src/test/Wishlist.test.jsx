import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Wishlist from '../pages/Wishlist';

// Feature Sprint 3: the dedicated "My Wishlist" page — did not exist at all
// before this sprint (the hook/API/backend were fully built but had zero
// real UI consumers anywhere in the app).

vi.mock('../api/wishlistApi.js', () => ({
  getWishlist: vi.fn(),
  addToWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  clearWishlist: vi.fn(),
}));

import { getWishlist, removeFromWishlist, clearWishlist } from '../api/wishlistApi.js';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Student' } }) }));
vi.mock('../components/layout/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Wishlist />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Wishlist page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loading state: shows a skeleton before the query resolves', async () => {
    let resolveFetch;
    getWishlist.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    renderPage();

    expect(document.querySelector('.ds-skel')).toBeTruthy();
    resolveFetch({ courses: [] });
    await waitFor(() => expect(document.querySelector('.ds-skel')).toBeFalsy());
  });

  it('empty state: shows a message and a link to browse courses when the wishlist is empty', async () => {
    getWishlist.mockResolvedValue({ courses: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /browse courses/i })).toBeInTheDocument();
  });

  it('error state: shows a retry option when the fetch fails', async () => {
    getWishlist.mockRejectedValue(new Error('Network error'));
    renderPage();

    await waitFor(() => expect(screen.getByText(/couldn't load your wishlist/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('successful fetch: renders each wishlisted course with a view link and a remove button', async () => {
    getWishlist.mockResolvedValue({
      courses: [
        { course: { _id: 'c1', title: 'Tajweed Basics', level: 'Beginner' }, addedAt: new Date().toISOString() },
        { course: { _id: 'c2', title: 'Hifz Programme', level: 'Advanced' }, addedAt: new Date().toISOString() },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Tajweed Basics')).toBeInTheDocument());
    expect(screen.getByText('Hifz Programme')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /view/i })).toHaveLength(2);
  });

  it('a course with no populated `course` (e.g. it was deleted) is filtered out instead of crashing', async () => {
    getWishlist.mockResolvedValue({ courses: [{ course: null, addedAt: new Date().toISOString() }] });
    renderPage();

    await waitFor(() => expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument());
  });

  it('removing a course calls removeFromWishlist with its id', async () => {
    getWishlist.mockResolvedValue({
      courses: [{ course: { _id: 'c1', title: 'Tajweed Basics', level: 'Beginner' }, addedAt: new Date().toISOString() }],
    });
    removeFromWishlist.mockResolvedValue({ courses: [] });
    renderPage();

    const removeBtn = await screen.findByRole('button', { name: /remove tajweed basics/i });
    await userEvent.click(removeBtn);

    expect(removeFromWishlist.mock.calls[0][0]).toBe('c1');
  });

  it('"Clear all" is shown only when the wishlist is non-empty and calls clearWishlist', async () => {
    getWishlist.mockResolvedValue({
      courses: [{ course: { _id: 'c1', title: 'Tajweed Basics' }, addedAt: new Date().toISOString() }],
    });
    clearWishlist.mockResolvedValue({ message: 'Wishlist cleared' });
    renderPage();

    const clearBtn = await screen.findByRole('button', { name: /clear all/i });
    await userEvent.click(clearBtn);

    expect(clearWishlist).toHaveBeenCalled();
  });

  it('"Clear all" is not shown when the wishlist is empty', async () => {
    getWishlist.mockResolvedValue({ courses: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText(/wishlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
  });
});
