import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWishlist, useIsWishlisted } from '../hooks/useWishlist';

vi.mock('../api/wishlistApi.js', () => ({
  getWishlist: vi.fn(),
  addToWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  clearWishlist: vi.fn(),
}));

import * as client from '../api/wishlistApi.js';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  function Wrapper({ children }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
  return Wrapper;
}

describe('useWishlist', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty courses array when wishlist is empty', async () => {
    client.getWishlist.mockResolvedValue({ courses: [] });
    const { result } = renderHook(() => useWishlist(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.courses).toHaveLength(0);
  });

  it('returns wishlist courses when populated', async () => {
    const mockCourses = [{ course: { _id: '1', title: 'Tajweed' }, addedAt: new Date() }];
    client.getWishlist.mockResolvedValue({ courses: mockCourses });
    const { result } = renderHook(() => useWishlist(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.courses).toHaveLength(1);
  });
});

describe('useIsWishlisted', () => {
  it('returns true when course is in wishlist', async () => {
    client.getWishlist.mockResolvedValue({ courses: [{ course: { _id: 'course-123' } }] });
    const { result } = renderHook(() => useIsWishlisted('course-123'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when course is not in wishlist', async () => {
    client.getWishlist.mockResolvedValue({ courses: [] });
    const { result } = renderHook(() => useIsWishlisted('course-999'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
