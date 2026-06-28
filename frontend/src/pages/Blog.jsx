import { useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import '../styles/quran.css';
import { posts, CATEGORY_COLORS } from '../data/blogPosts';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';

export default function Blog() {
  const { t } = useLang();
  const bl = t.blog;
  const [activeCategory, setActiveCategory] = useState('All');
  useSEO({ title: bl.eyebrow, description: bl.sub });

  const categories = ['All', ...Array.from(new Set(posts.map((p) => p.category)))];
  const filtered = activeCategory === 'All' ? posts : posts.filter((p) => p.category === activeCategory);

  return (
    <div className="blog-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">{bl.backToSite}</Link>
        </div>
      </header>

      <Breadcrumbs items={[{ label: 'Resources', to: '/resources' }, { label: bl.heading }]} />

      <main id="main-content" className="container blog-page__main">
        <div className="blog-page__header">
          <p className="eyebrow">{bl.eyebrow}</p>
          <h1>{bl.heading}</h1>
          <p className="blog-page__sub">{bl.sub}</p>
        </div>

        {/* Category filters */}
        <div className="blog-page__filters">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`blog-filter-btn${activeCategory === cat ? ' active' : ''}`}
              style={activeCategory === cat && cat !== 'All'
                ? { background: CATEGORY_COLORS[cat] || '#0b6e4f', borderColor: CATEGORY_COLORS[cat] || '#0b6e4f' }
                : {}}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="blog-grid">
          {filtered.map((p) => (
            <Link to={`/blog/${p.slug}`} className="blog-card" key={p.slug} style={{ textDecoration: 'none' }}>
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
      </main>
    </div>
  );
}
