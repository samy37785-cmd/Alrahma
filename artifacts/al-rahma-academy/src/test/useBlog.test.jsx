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
//
// Frontend/backend locale-contract fix (PR #123 follow-up): the backend now
// requires an explicit ?locale=en|ar on both endpoints and 400s with no
// fallback if it's missing (backend/controllers/blogController.js's
// requireLocale()). Every call below now passes a locale to match; the
// dedicated 'never requests without a locale' block further down proves the
// hooks themselves enforce this, not just well-behaved callers.
describe('useBlogPosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the envelope to the bare posts array', async () => {
    const posts = [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }];
    client.getBlogPosts.mockResolvedValue({ posts, total: 2, page: 1, pages: 1 });

    const { result } = renderHook(() => useBlogPosts({ locale: 'en' }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data).toEqual(posts);
  });

  it('unwraps an empty envelope to an empty array, not undefined', async () => {
    client.getBlogPosts.mockResolvedValue({ posts: [], total: 0, page: 1, pages: 0 });

    const { result } = renderHook(() => useBlogPosts({ locale: 'en' }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('passes locale through to getBlogPosts', async () => {
    client.getBlogPosts.mockResolvedValue({ posts: [], total: 0, page: 1, pages: 0 });

    renderHook(() => useBlogPosts({ locale: 'ar' }), { wrapper: wrapper() });
    await waitFor(() => expect(client.getBlogPosts).toHaveBeenCalledWith({ locale: 'ar' }));
  });
});

describe('useBlogPost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the envelope to the bare post object', async () => {
    const post = { slug: 'a', title: 'A', body: 'Full content' };
    client.getBlogPost.mockResolvedValue({ post });

    const { result } = renderHook(() => useBlogPost('a', 'en'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(post);
  });

  it('passes slug and locale through to getBlogPost', async () => {
    client.getBlogPost.mockResolvedValue({ post: { slug: 'a', title: 'A' } });

    renderHook(() => useBlogPost('a', 'ar'), { wrapper: wrapper() });
    await waitFor(() => expect(client.getBlogPost).toHaveBeenCalledWith('a', 'ar'));
  });
});

// No public blog request may ever fire without a locale — the `enabled`
// guards in useBlog.js are what actually enforces this (defense in depth
// beyond every call site remembering to pass one).
describe('locale is required — no request ever fires without one', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useBlogPosts never calls getBlogPosts when locale is missing', async () => {
    const { result } = renderHook(() => useBlogPosts({}), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getBlogPosts).not.toHaveBeenCalled();
  });

  it('useBlogPosts never calls getBlogPosts when called with no params at all', async () => {
    const { result } = renderHook(() => useBlogPosts(), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getBlogPosts).not.toHaveBeenCalled();
  });

  it('useBlogPost never calls getBlogPost when locale is missing', async () => {
    const { result } = renderHook(() => useBlogPost('a', undefined), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getBlogPost).not.toHaveBeenCalled();
  });

  it('useBlogPost never calls getBlogPost when slug is missing, even with a locale', async () => {
    const { result } = renderHook(() => useBlogPost(undefined, 'en'), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getBlogPost).not.toHaveBeenCalled();
  });
});
