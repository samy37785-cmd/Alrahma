import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBlogPosts, useBlogPost } from '../hooks/useBlog';

vi.mock('../api/blogApi.js', () => ({
  getBlogPosts: vi.fn(),
  getBlogPost: vi.fn(),
}));

import * as client from '../api/blogApi.js';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  function Wrapper({ children }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
  return Wrapper;
}

// The backend wraps list/detail responses in an envelope ({ posts, total,
// page, pages } / { post }) for pagination metadata. Blog.jsx and
// BlogPost.jsx consume the array/object directly — this locks in the
// `select` unwrapping in useBlog.js so the response-shape mismatch that
// crashed the Blog page (`posts.map is not a function`) can't regress.
describe('useBlogPosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the envelope to the bare posts array', async () => {
    const posts = [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }];
    client.getBlogPosts.mockResolvedValue({ posts, total: 2, page: 1, pages: 1 });

    const { result } = renderHook(() => useBlogPosts(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data).toEqual(posts);
  });

  it('unwraps an empty envelope to an empty array, not undefined', async () => {
    client.getBlogPosts.mockResolvedValue({ posts: [], total: 0, page: 1, pages: 0 });

    const { result } = renderHook(() => useBlogPosts(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe('useBlogPost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the envelope to the bare post object', async () => {
    const post = { slug: 'a', title: 'A', body: 'Full content' };
    client.getBlogPost.mockResolvedValue({ post });

    const { result } = renderHook(() => useBlogPost('a'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(post);
  });
});
