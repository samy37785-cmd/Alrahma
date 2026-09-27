import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Blog from '../pages/Blog';
import BlogPost from '../pages/BlogPost';

// Frontend/backend locale-contract fix (PR #123 follow-up): the backend
// blog endpoints now require an explicit ?locale=en|ar with no fallback
// (backend/controllers/blogController.js's requireLocale()). This proves
// the real pages — not just the hooks in isolation (see useBlog.test.jsx)
// — resolve the correct locale from the current URL's language prefix and
// pass it all the way down to the mocked HTTP layer.

vi.mock('../api/blogApi.js', () => ({
  getBlogPosts: vi.fn(),
  getBlogPost: vi.fn(),
}));
import * as blogApi from '../api/blogApi.js';

function renderHarness(path_, ui) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <Routes>
            <Route path="/resources/blog" element={<Blog />} />
            <Route path="/resources/blog/:slug" element={<BlogPost />} />
          </Routes>
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('Blog page: requests the correct locale for the current language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blogApi.getBlogPosts.mockResolvedValue({ posts: [], total: 0, page: 1, pages: 0 });
  });

  it('/resources/blog requests locale=en', async () => {
    renderHarness('/resources/blog');
    await waitFor(() => expect(blogApi.getBlogPosts).toHaveBeenCalledWith({ locale: 'en' }));
  });

  it('/ar/resources/blog requests locale=ar', async () => {
    renderHarness('/ar/resources/blog');
    await waitFor(() => expect(blogApi.getBlogPosts).toHaveBeenCalledWith({ locale: 'ar' }));
  });
});

describe('BlogPost page: requests the correct locale for the current language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blogApi.getBlogPosts.mockResolvedValue({ posts: [], total: 0, page: 1, pages: 0 });
    blogApi.getBlogPost.mockResolvedValue({
      post: { slug: 'sample', title: 'Sample', excerpt: 'x', body: 'x', category: 'general', date: '2026-01-01' },
    });
  });

  it('/resources/blog/:slug requests locale=en for both the post and the prev/next list', async () => {
    renderHarness('/resources/blog/sample');
    await waitFor(() => expect(blogApi.getBlogPost).toHaveBeenCalledWith('sample', 'en'));
    await waitFor(() => expect(blogApi.getBlogPosts).toHaveBeenCalledWith({ locale: 'en' }));
  });

  it('/ar/resources/blog/:slug requests locale=ar for both the post and the prev/next list', async () => {
    renderHarness('/ar/resources/blog/sample');
    await waitFor(() => expect(blogApi.getBlogPost).toHaveBeenCalledWith('sample', 'ar'));
    await waitFor(() => expect(blogApi.getBlogPosts).toHaveBeenCalledWith({ locale: 'ar' }));
  });
});
