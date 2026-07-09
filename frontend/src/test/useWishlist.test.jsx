import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useWishlist, useIsWishlisted, useAddToWishlist, useRemoveFromWishlist, useClearWishlist,
} from '../hooks/useWishlist';

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

// Feature Sprint 3: the mutation hooks (add/remove/clear) had no coverage at
// all — only the read side (useWishlist/useIsWishlisted) was ever tested.
describe('useAddToWishlist', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the API with the courseId and invalidates the wishlist cache on success', async () => {
    client.addToWishlist.mockResolvedValue({ courses: [{ course: { _id: 'c1' } }] });
    const { result } = renderHook(() => useAddToWishlist(), { wrapper: wrapper() });

    result.current.mutate('c1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.addToWishlist.mock.calls[0][0]).toBe('c1');
  });

  it('surfaces a failure via isError instead of throwing', async () => {
    client.addToWishlist.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAddToWishlist(), { wrapper: wrapper() });

    result.current.mutate('c1');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useRemoveFromWishlist', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the API with the courseId', async () => {
    client.removeFromWishlist.mockResolvedValue({ courses: [] });
    const { result } = renderHook(() => useRemoveFromWishlist(), { wrapper: wrapper() });

    result.current.mutate('c1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.removeFromWishlist.mock.calls[0][0]).toBe('c1');
  });
});

describe('useClearWishlist', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the clear API with no arguments', async () => {
    client.clearWishlist.mockResolvedValue({ message: 'Wishlist cleared' });
    const { result } = renderHook(() => useClearWishlist(), { wrapper: wrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.clearWishlist).toHaveBeenCalled();
  });
});
