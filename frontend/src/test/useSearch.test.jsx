import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGlobalSearch } from '../hooks/useSearch';

vi.mock('../api/searchApi.js', () => ({
  globalSearch: vi.fn(),
  searchCourses: vi.fn(),
  searchTeachers: vi.fn(),
}));

import * as client from '../api/searchApi.js';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  function Wrapper({ children }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
  return Wrapper;
}

describe('useGlobalSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch when query is shorter than 2 chars', () => {
    renderHook(() => useGlobalSearch('q'), { wrapper: wrapper() });
    expect(client.globalSearch).not.toHaveBeenCalled();
  });

  it('does not fetch when query is empty', () => {
    renderHook(() => useGlobalSearch(''), { wrapper: wrapper() });
    expect(client.globalSearch).not.toHaveBeenCalled();
  });

  it('fetches when query is 2+ chars', async () => {
    client.globalSearch.mockResolvedValue({ q: 'taj', results: { courses: [], posts: [], teachers: [] } });
    const { result } = renderHook(() => useGlobalSearch('taj'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.globalSearch).toHaveBeenCalledWith('taj', expect.any(AbortSignal));
  });
});
