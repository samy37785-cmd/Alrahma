import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import PageBar from '../components/layout/PageBar';
import { CATEGORY_COLORS } from '../data/blogPosts';
import { useBlogPosts, BLOG_KEYS } from '../hooks/useBlog';
import { getBlogPost } from '../api/blogApi';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import { Skeleton } from '../components/ui/Skeleton';

function BlogCardSkeleton() {
  return (
    <div className="blog-card" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <Skeleton height={20} width="30%" radius="var(--radius-full)" style={{ marginBottom: 12 }} />
      <Skeleton height={22} width="90%" style={{ marginBottom: 6 }} />
      <Skeleton height={22} width="70%" style={{ marginBottom: 12 }} />
      <Skeleton height={14} style={{ marginBottom: 5 }} />
      <Skeleton height={14} style={{ marginBottom: 5 }} />
      <Skeleton height={14} width="65%" style={{ marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton height={12} width={60} />
        <Skeleton height={12} width={80} />
      </div>
    </div>
  );
}

export default function Blog() {
  const { t } = useLang();
  const bl = t.blog;
  const [activeCategory, setActiveCategory] = useState('All');
  const queryClient = useQueryClient();
  useSEO({ title: bl.eyebrow, description: bl.sub });

  const { data: posts = [], isLoading, isError } = useBlogPosts();

  const categories = useMemo(
    () => ['All', ...new Set(posts.map((p) => p.category))],
    [posts],
  );
  const filtered = useMemo(
    () => activeCategory === 'All' ? posts : posts.filter((p) => p.category === activeCategory),
    [posts, activeCategory],
  );

  const prefetchPost = (slug) => {
    queryClient.prefetchQuery({
      queryKey: BLOG_KEYS.post(slug),
      queryFn:  () => getBlogPost(slug),
      staleTime: 1000 * 60 * 10,
    });
  };

  return (
    <div className="blog-page">
      <PageBar to="/" label={bl.backToSite} />

      <Breadcrumbs items={[{ label: 'Resources', to: '/resources' }, { label: bl.heading }]} />

      <main id="main-content" className="container blog-page__main">
        <div className="blog-page__header">
          <p className="eyebrow">{bl.eyebrow}</p>
          <h1>{bl.heading}</h1>
          <p className="blog-page__sub">{bl.sub}</p>
        </div>

        {isLoading && (
          <div className="blog-grid" aria-busy="true" aria-label="Loading articles">
            {Array.from({ length: 6 }, (_, i) => <BlogCardSkeleton key={i} />)}
          </div>
        )}
        {isError && (
          <p className="blog-page__empty" style={{ color: 'var(--color-danger)' }}>
            Could not load articles. Please try again.
          </p>
        )}

        {!isLoading && !isError && (
          <>
            {/* Category filters */}
            <div className="blog-page__filters">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`blog-filter-btn${activeCategory === cat ? ' active' : ''}`}
                  style={
                    activeCategory === cat && cat !== 'All'
                      ? { background: CATEGORY_COLORS[cat] || '#0b6e4f', borderColor: CATEGORY_COLORS[cat] || '#0b6e4f' }
                      : {}
                  }
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="blog-grid">
              {filtered.map((p) => (
                <Link
                  to={`/blog/${p.slug}`}
                  className="blog-card"
                  key={p.slug}
                  style={{ textDecoration: 'none' }}
                  onMouseEnter={() => prefetchPost(p.slug)}
                >
                  <span
                    className="blog-card__cat"
                    style={{ background: CATEGORY_COLORS[p.category] || '#0b6e4f' }}
                  >
                    {p.category}
                  </span>
                  <h2 className="blog-card__title">{p.title}</h2>
                  <p className="blog-card__excerpt">{p.excerpt}</p>
                  <div className="blog-card__footer">
                    <span className="blog-card__date">{p.date}</span>
                    {p.readTime && <span className="blog-card__read-time">⏱ {p.readTime}</span>}
                    <span className="blog-card__read">{bl.readArticle}</span>
                  </div>
                  {p.author && (
                    <div className="blog-card__author">
                      <span className="blog-card__author-name">✍ {p.author.name}</span>
                      <span className="blog-card__author-role">{p.author.role}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>

            {filtered.length === 0 && (
              <p className="blog-page__empty">No articles in this category yet.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
