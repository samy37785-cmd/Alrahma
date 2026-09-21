import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Breadcrumbs from '../components/ui/Breadcrumbs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Breadcrumb UI localization fix (2026-09-21): the Localized Breadcrumb
// JSON-LD Discovery found 7 pages whose FIRST visible breadcrumb crumb was
// a hardcoded English string literal with no lang branch at all, so it
// stayed English even on /ar/... pages that were otherwise fully Arabic
// (confirmed live on production for About/FAQ/CourseIjazah). This fix
// replaces each hardcoded literal with the matching t.nav.* key that
// already existed and was already used elsewhere in the app for the same
// destination (e.g. AcademyHub.jsx already used t.nav.academy for
// "/academy"). No new translation was written.
//
// t.nav.tools is "Islamic Tools" (not "Tools") and t.nav.blog is "Blog &
// Articles" (not "Blog") — real, pre-existing site vocabulary already used
// by ToolsHub.jsx's own breadcrumb and the main nav menu. Using them here
// makes Adhkar's and BlogPost's breadcrumb link text match the destination
// hub's own name exactly (a real consistency improvement), at the cost of
// the EN breadcrumb text for those two specific crumbs changing from the
// old ad-hoc literal. This is called out explicitly in this file's
// "English is real text, not merely non-empty" tests below rather than
// asserted as byte-identical to the old literal for those two.

function renderHarness(path_, children) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>,
  );
}

function firstCrumbText() {
  // index 0 is always the "Home" crumb that Breadcrumbs.jsx itself
  // prepends; index 1 is the first crumb each page actually passes in.
  return screen.getAllByRole('listitem')[1].textContent.replace('›', '').trim();
}

afterEach(() => {
  cleanup();
});

describe('About.jsx / AcademyHub-destination crumb: real Arabic, matches t.nav.academy', () => {
  function AboutBreadcrumbLike() {
    const { t } = useLang();
    return <Breadcrumbs items={[{ label: t.nav.academy, to: '/academy' }, { label: t.about.eyebrow }]} />;
  }

  it('English (/academy/about): first crumb is the real English nav label, unchanged from before', () => {
    renderHarness('/academy/about', <AboutBreadcrumbLike />);
    expect(firstCrumbText()).toBe('Academy');
  });

  it('Arabic (/ar/academy/about): first crumb is real Arabic, no Latin letters', () => {
    renderHarness('/ar/academy/about', <AboutBreadcrumbLike />);
    const text = firstCrumbText();
    expect(text).toBe('الأكاديمية');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

describe('FAQ.jsx / resources crumb: real Arabic, matches t.nav.resources', () => {
  function FAQBreadcrumbLike() {
    const { t } = useLang();
    return <Breadcrumbs items={[{ label: t.nav.resources, to: '/resources' }, { label: t.faqPg.heading }]} />;
  }

  it('English (/resources/faq): first crumb unchanged', () => {
    renderHarness('/resources/faq', <FAQBreadcrumbLike />);
    expect(firstCrumbText()).toBe('Resources');
  });

  it('Arabic (/ar/resources/faq): first crumb is real Arabic, no Latin letters', () => {
    renderHarness('/ar/resources/faq', <FAQBreadcrumbLike />);
    const text = firstCrumbText();
    expect(text).toBe('الموارد');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

describe('Blog.jsx / resources crumb: real Arabic, matches t.nav.resources', () => {
  function BlogBreadcrumbLike() {
    const { t } = useLang();
    return <Breadcrumbs items={[{ label: t.nav.resources, to: '/resources' }, { label: t.blog.heading }]} />;
  }

  it('English (/resources/blog): first crumb unchanged', () => {
    renderHarness('/resources/blog', <BlogBreadcrumbLike />);
    expect(firstCrumbText()).toBe('Resources');
  });

  it('Arabic (/ar/resources/blog): first crumb is real Arabic, no Latin letters', () => {
    renderHarness('/ar/resources/blog', <BlogBreadcrumbLike />);
    const text = firstCrumbText();
    expect(text).toBe('الموارد');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

describe('CourseIjazah.jsx / courses crumb: real Arabic, matches t.nav.courses', () => {
  function IjazahBreadcrumbLike() {
    const { t, lang } = useLang();
    const isAr = lang === 'ar';
    return <Breadcrumbs items={[{ label: t.nav.courses, to: '/courses' }, { label: isAr ? 'دورة الإجازة' : 'Quran Ijazah Course' }]} />;
  }

  it('English (/courses/ijazah): first crumb unchanged', () => {
    renderHarness('/courses/ijazah', <IjazahBreadcrumbLike />);
    expect(firstCrumbText()).toBe('Courses');
  });

  it('Arabic (/ar/courses/ijazah): first crumb is real Arabic, no Latin letters', () => {
    renderHarness('/ar/courses/ijazah', <IjazahBreadcrumbLike />);
    const text = firstCrumbText();
    expect(text).toBe('الدورات');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

describe('CourseIslamicStudies.jsx / courses crumb: real Arabic, matches t.nav.courses', () => {
  function IslamicStudiesBreadcrumbLike() {
    const { t, lang } = useLang();
    const isAr = lang === 'ar';
    return <Breadcrumbs items={[{ label: t.nav.courses, to: '/courses' }, { label: isAr ? 'الدراسات الإسلامية' : 'Islamic Studies Course' }]} />;
  }

  it('English (/courses/islamic-studies): first crumb unchanged', () => {
    renderHarness('/courses/islamic-studies', <IslamicStudiesBreadcrumbLike />);
    expect(firstCrumbText()).toBe('Courses');
  });

  it('Arabic (/ar/courses/islamic-studies): first crumb is real Arabic, no Latin letters', () => {
    renderHarness('/ar/courses/islamic-studies', <IslamicStudiesBreadcrumbLike />);
    const text = firstCrumbText();
    expect(text).toBe('الدورات');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

describe('Adhkar.jsx / tools crumb: real Arabic, matches t.nav.tools (real text, not the old shorter literal)', () => {
  function AdhkarBreadcrumbLike() {
    const { t, lang } = useLang();
    const isAr = lang === 'ar';
    return <Breadcrumbs items={[{ label: t.nav.tools, to: '/tools' }, { label: isAr ? 'الأذكار' : 'Adhkar' }]} />;
  }

  it('English (/tools/adhkar): first crumb is real, non-empty site vocabulary ("Islamic Tools", the same label ToolsHub.jsx itself uses)', () => {
    renderHarness('/tools/adhkar', <AdhkarBreadcrumbLike />);
    expect(firstCrumbText()).toBe('Islamic Tools');
  });

  it('Arabic (/ar/tools/adhkar): first crumb is real Arabic, no Latin letters', () => {
    renderHarness('/ar/tools/adhkar', <AdhkarBreadcrumbLike />);
    const text = firstCrumbText();
    expect(text).toBe('أدوات إسلامية');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

// BlogPost.jsx depends on real async post data (useBlogPost/useBlogPosts),
// and there is no slug guaranteed stable in production to hit a real API
// with — so this renders the REAL component with the real API module
// mocked (same vi.mock('../api/blogApi.js', ...) pattern already
// established in src/test/useBlog.test.jsx), never a real network call.
vi.mock('../api/blogApi.js', () => ({
  getBlogPosts: vi.fn(),
  getBlogPost: vi.fn(),
}));

describe('BlogPost.jsx / blog crumb: real Arabic, matches t.nav.blog (real text, not the old shorter literal)', () => {
  const fixturePost = {
    slug: 'test-post',
    title: 'Test Post Title',
    excerpt: 'Test excerpt.',
    body: 'Test body.',
    date: '2026-01-01',
    category: 'General',
  };

  function renderBlogPost(path_) {
    // LangProvider (context/LangContext.jsx) reads window.location.pathname
    // directly, not the Router's own location — it must be kept in sync
    // with MemoryRouter's initialEntries, exactly like renderHarness()
    // above does for BrowserRouter, or the previous test's leftover
    // window.location would silently pick the wrong language here.
    window.history.replaceState({}, '', path_);
    const { basename } = langFromPath(path_);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    return render(
      <QueryClientProvider client={qc}>
        {/* MemoryRouter, like BrowserRouter, expects initialEntries to
            include the language-prefixed path; it strips `basename`
            internally to match the `Route path` below. */}
        <MemoryRouter basename={basename} initialEntries={[path_]}>
          <LangProvider>
            <Routes>
              <Route path="/resources/blog/:slug" element={<BlogPostUnderTest />} />
            </Routes>
          </LangProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  let BlogPostUnderTest;

  it('loads the real component and mocked fixture without any real network call', async () => {
    const client = await import('../api/blogApi.js');
    client.getBlogPost.mockResolvedValue({ post: fixturePost });
    client.getBlogPosts.mockResolvedValue({ posts: [fixturePost], total: 1, page: 1, pages: 1 });
    BlogPostUnderTest = (await import('../pages/BlogPost')).default;
    expect(client.getBlogPost).not.toHaveBeenCalled(); // only called once actually rendered below
  });

  it('English (/resources/blog/test-post): first crumb is real, non-empty site vocabulary ("Blog & Articles")', async () => {
    renderBlogPost('/resources/blog/test-post');
    // The post title legitimately appears twice once loaded (the <h1> and
    // the breadcrumb's own current-page crumb) — the <h1> is the unique,
    // unambiguous signal that the real post (not the loading/error state)
    // has rendered.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: fixturePost.title })).toBeInTheDocument());
    expect(firstCrumbText()).toBe('Blog & Articles');
  });

  it('Arabic (/ar/resources/blog/test-post): first crumb is real Arabic, no Latin letters', async () => {
    renderBlogPost('/ar/resources/blog/test-post');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: fixturePost.title })).toBeInTheDocument());
    const text = firstCrumbText();
    expect(text).toBe('المدونة والمقالات');
    expect(text).not.toMatch(/[a-zA-Z]/);
  });
});

// Source-level guard: proves the actual page files were edited (not just
// that a hypothetical Breadcrumbs-like proxy would behave correctly above)
// and that no new translation dictionary was invented — every replacement
// reads from the existing central t.nav.* keys.
describe('page sources: hardcoded first-crumb English literal is gone, t.nav.* is used instead', () => {
  const PAGES = [
    { file: '../pages/About.jsx', oldLiteral: /label:\s*'Academy'/, newKey: /label:\s*t\.nav\.academy/ },
    { file: '../pages/FAQ.jsx', oldLiteral: /label:\s*'Resources'/, newKey: /label:\s*t\.nav\.resources/ },
    { file: '../pages/Blog.jsx', oldLiteral: /label:\s*'Resources'/, newKey: /label:\s*t\.nav\.resources/ },
    { file: '../pages/BlogPost.jsx', oldLiteral: /label:\s*'Blog'/, newKey: /label:\s*t\.nav\.blog/ },
    { file: '../pages/CourseIjazah.jsx', oldLiteral: /label:\s*'Courses'/, newKey: /label:\s*t\.nav\.courses/ },
    { file: '../pages/CourseIslamicStudies.jsx', oldLiteral: /label:\s*'Courses'/, newKey: /label:\s*t\.nav\.courses/ },
    { file: '../pages/Adhkar.jsx', oldLiteral: /label:\s*'Tools'/, newKey: /label:\s*t\.nav\.tools/ },
  ];

  for (const { file, oldLiteral, newKey } of PAGES) {
    it(`${file}: no hardcoded literal, uses the existing t.nav.* key`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      expect(src, `${file} still has the old hardcoded literal`).not.toMatch(oldLiteral);
      expect(src, `${file} does not read from the expected t.nav.* key`).toMatch(newKey);
    });
  }

  it('no new translation object or dictionary was introduced for this fix', () => {
    for (const { file } of PAGES) {
      const src = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      expect(src, `${file} should not gain a new inline breadcrumb translation object`).not.toMatch(/BREADCRUMB_(TEXT|LABELS)/);
    }
  });
});
