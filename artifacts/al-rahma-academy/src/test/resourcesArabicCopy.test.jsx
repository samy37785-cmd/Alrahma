import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import useSEO from '../hooks/useSEO';
import { RESOURCES_SEO_TEXT, pickResourcesSeo, RESOURCES_BLOG_TEXT, pickResourcesBlogText } from '../i18n/resources/content';
import Blog from '../pages/Blog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resources hub + Blog Arabic copy fix (Comprehensive EN/AR Audit Phase 2):
// /ar/resources' meta description and /ar/resources/blog's category "All"
// filter + empty-state message all stayed English on otherwise-Arabic
// pages. Same fix shape and same *SeoLike-proxy test pattern as the
// earlier Home/Courses/Academy SEO fixes (src/test/homeArabicSeo.test.jsx,
// src/test/coursesArabicSeo.test.jsx, src/test/academyArabicSeo.test.jsx).

vi.mock('../api/blogApi.js', () => ({
  getBlogPosts: vi.fn(),
  getBlogPost: vi.fn(),
}));
import { getBlogPosts } from '../api/blogApi.js';

function renderHarness(path_, children) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function ResourcesSeoLike() {
  const { t, lang } = useLang();
  const seo = pickResourcesSeo(lang);
  useSEO({ title: t.nav.resources, description: seo.description });
  return null;
}

function renderBlog(path_) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <LangProvider>
          <Blog />
        </LangProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('Resources hub SEO metadata: real Arabic, not an English fallback', () => {
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English (/resources): title and meta description are the real English copy, unchanged from before this fix', () => {
    renderHarness('/resources', <ResourcesSeoLike />);
    expect(document.title.length).toBeGreaterThan(0);
    const description = document.querySelector('meta[name="description"]').content;
    expect(description).toBe(RESOURCES_SEO_TEXT.en.description);
    expect(description).toBe(
      'Explore resources from Al-Rahma Academy: blog articles, FAQ, academy information, and teacher profiles.',
    );
  });

  it('Arabic (/ar/resources): meta description is real Arabic copy, not the English string', () => {
    renderHarness('/ar/resources', <ResourcesSeoLike />);
    const description = document.querySelector('meta[name="description"]').content;
    expect(description).toBe(RESOURCES_SEO_TEXT.ar.description);
    expect(description.length).toBeGreaterThan(0);
    expect(description).not.toBe(RESOURCES_SEO_TEXT.en.description);
    expect(description).not.toMatch(/[a-zA-Z]/);
  });

  it('the Arabic description states only what the page\'s own Arabic body content already says: blog, FAQ, academy info, teachers — no invented number or price', () => {
    const { description } = RESOURCES_SEO_TEXT.ar;
    expect(description).toMatch(/المدونة/);
    expect(description).toMatch(/الأسئلة الشائعة/);
    expect(description).toMatch(/الأكاديمية/);
    expect(description).toMatch(/معلمينا/);
    expect(description).not.toMatch(/\d/);
  });

  it('a legacy language without real Resources copy (e.g. fr) falls back to the English object, not an invented translation', () => {
    expect(pickResourcesSeo('fr')).toBe(RESOURCES_SEO_TEXT.en);
    expect(pickResourcesSeo('es')).toBe(RESOURCES_SEO_TEXT.en);
    expect(Object.keys(RESOURCES_SEO_TEXT)).toEqual(['en', 'ar']);
  });
});

describe('Blog page copy: "All" filter and empty state are real Arabic, not an English leak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlogPosts.mockResolvedValue({ posts: [], total: 0, page: 1, pages: 0 });
  });
  afterEach(() => {
    cleanup();
    document.title = '';
  });

  it('English (/resources/blog): filter reads "All" and empty state is the unchanged English sentence', async () => {
    renderBlog('/resources/blog');
    await waitFor(() => expect(screen.getByText('All')).toBeInTheDocument());
    expect(screen.getByText('No articles in this category yet.')).toBeInTheDocument();
  });

  it('Arabic (/ar/resources/blog): filter reads "الكل", never the English word "All"', async () => {
    renderBlog('/ar/resources/blog');
    await waitFor(() => expect(screen.getByText('الكل')).toBeInTheDocument());
    expect(screen.queryByText('All')).toBeNull();
  });

  it('Arabic (/ar/resources/blog): empty state is real Arabic, never "No articles available/yet" in English', async () => {
    renderBlog('/ar/resources/blog');
    await waitFor(() => expect(screen.getByText('لا توجد مقالات منشورة حتى الآن.')).toBeInTheDocument());
    expect(screen.queryByText(/No articles/i)).toBeNull();
  });

  it('a legacy language without real Blog-chrome copy (e.g. fr) falls back to English, not an invented translation', () => {
    expect(pickResourcesBlogText('fr')).toBe(RESOURCES_BLOG_TEXT.en);
    expect(pickResourcesBlogText('de')).toBe(RESOURCES_BLOG_TEXT.en);
    expect(Object.keys(RESOURCES_BLOG_TEXT)).toEqual(['en', 'ar']);
  });
});

describe('ResourcesHub.jsx / Blog.jsx source: minimal, scoped diff', () => {
  const resourcesHubSrc = fs.readFileSync(path.resolve(__dirname, '../pages/hubs/ResourcesHub.jsx'), 'utf8');
  const blogSrc = fs.readFileSync(path.resolve(__dirname, '../pages/Blog.jsx'), 'utf8');

  it('ResourcesHub.jsx imports and calls pickResourcesSeo(lang), no more hardcoded English description literal', () => {
    expect(resourcesHubSrc).toMatch(/pickResourcesSeo\(lang\)/);
    expect(resourcesHubSrc).not.toMatch(/Explore resources from Al-Rahma Academy/);
  });

  it('Blog.jsx imports and calls pickResourcesBlogText(lang), no more hardcoded English chrome literals', () => {
    expect(blogSrc).toMatch(/pickResourcesBlogText\(lang\)/);
    expect(blogSrc).not.toMatch(/No articles in this category yet\./);
  });

  it('neither file introduces an isAr ? ... : ... branch', () => {
    expect(resourcesHubSrc).not.toMatch(/isAr/);
    expect(blogSrc).not.toMatch(/isAr/);
  });

  it('Blog.jsx still uses the literal "All" as the internal filter sentinel/state value — filtering logic is untouched', () => {
    expect(blogSrc).toMatch(/useState\('All'\)/);
    expect(blogSrc).toMatch(/activeCategory === 'All'/);
  });

  it('ResourcesHub.jsx title wiring is untouched (still t.nav.resources)', () => {
    expect(resourcesHubSrc).toMatch(/title:\s*t\.nav\.resources/);
  });

  it('neither file touches H1, hub cards, CTA, or post-fetching logic', () => {
    expect(resourcesHubSrc).toContain('hub-cards');
    expect(blogSrc).toContain('useBlogPosts');
    expect(blogSrc).toContain('blog-grid');
  });
});
