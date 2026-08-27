import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuranBookmarks, useIsBookmarked } from '../hooks/useQuranBookmarks';

vi.mock('../api/quranBookmarkApi.js', () => ({
  getBookmarks: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1' } }),
}));

import * as bookmarkApi from '../api/quranBookmarkApi.js';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  function Wrapper({ children }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
  return Wrapper;
}

describe('useQuranBookmarks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty list when the user has no bookmarks', async () => {
    bookmarkApi.getBookmarks.mockResolvedValue([]);
    const { result } = renderHook(() => useQuranBookmarks(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });

  it('returns bookmarked verses when populated', async () => {
    bookmarkApi.getBookmarks.mockResolvedValue([{ verseKey: '2:255', chapterId: 2, verseNum: 255 }]);
    const { result } = renderHook(() => useQuranBookmarks(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useIsBookmarked', () => {
  it('returns true when the verse is bookmarked', async () => {
    bookmarkApi.getBookmarks.mockResolvedValue([{ verseKey: '2:255' }]);
    const { result } = renderHook(() => useIsBookmarked('2:255'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when the verse is not bookmarked', async () => {
    bookmarkApi.getBookmarks.mockResolvedValue([]);
    const { result } = renderHook(() => useIsBookmarked('2:255'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
