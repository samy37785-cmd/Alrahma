import { Link } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import { posts, CATEGORY_COLORS } from '../data/blogPosts';
import useSEO from '../hooks/useSEO';

export default function Blog() {
  useSEO({ title: 'Blog', description: 'Articles on Quran, Tajweed, Arabic and Islamic education for non-Arabic speakers in Europe.' });
  return (
    <div className="blog-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">Back to site</Link>
        </div>
      </header>

      <main className="container blog-page__main">
        <div className="blog-page__header">
          <p className="eyebrow">Our Blog</p>
          <h1>Learn. Understand. Grow.</h1>
          <p className="blog-page__sub">Articles on Quran, Tajweed, Arabic and Islamic education — written for non-Arabic speakers in Europe.</p>
        </div>

        <div className="blog-grid">
          {posts.map((p) => (
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
                <span className="blog-card__read">Read article →</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
