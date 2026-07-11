import { useParams, Link, Navigate } from 'react-router-dom';
import PageBar from '../components/layout/PageBar';
import { CATEGORY_COLORS } from '../data/blogPosts';
import { useBlogPost, useBlogPosts } from '../hooks/useBlog';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';

// Minimal markdown renderer: headings, bold, tables, hr, paragraphs.
function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h2) { elements.push(<h2 key={key++}>{h2[1]}</h2>); i++; continue; }
    if (h3) { elements.push(<h3 key={key++}>{h3[1]}</h3>); i++; continue; }

    // HR
    if (line.trim() === '---') { elements.push(<hr key={key++} />); i++; continue; }

    // Table
    if (line.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !l.match(/^\|[-| ]+\|$/))
        .map((l) => l.split('|').filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1).map((c) => c.trim()));
      elements.push(
        <div key={key++} className="blog-post__table-wrap">
          <table className="blog-post__table">
            <thead>
              <tr>{rows[0]?.map((c, ci) => <th key={ci}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri}>{row.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // List item
    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++}>
          {items.map((item, ii) => <li key={ii}>{parseInline(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    elements.push(
      <p key={key++}>{parseInline(line)}</p>
    );
    i++;
  }

  return elements;
}

function parseInline(text) {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={i}>{seg.slice(2, -2)}</strong>;
    if (seg.startsWith('*')  && seg.endsWith('*'))  return <em key={i}>{seg.slice(1, -1)}</em>;
    return seg;
  });
}

export default function BlogPost() {
  const { slug } = useParams();

  const { data: post, isLoading, isError } = useBlogPost(slug);

  // Fetch the full list to determine prev/next neighbours.
  const { data: allPosts = [] } = useBlogPosts();
  const idx  = allPosts.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? allPosts[idx - 1] : null;
  const next = idx < allPosts.length - 1 ? allPosts[idx + 1] : null;

  useSEO({
    title: post?.title,
    description: post?.excerpt,
    type: 'article',
    schema: post ? {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      articleSection: post.category,
      inLanguage: 'en',
      image: 'https://al-rahmaacademy.com/og-cover.svg',
      author: { '@type': 'Organization', name: 'Al-Rahma Academy', url: 'https://al-rahmaacademy.com' },
      publisher: {
        '@type': 'Organization',
        name: 'Al-Rahma Academy',
        logo: { '@type': 'ImageObject', url: 'https://al-rahmaacademy.com/favicon.svg' },
      },
      mainEntityOfPage: `https://al-rahmaacademy.com/blog/${post.slug}`,
    } : null,
  });

  if (isLoading) {
    return (
      <div className="blog-post-page">
        <PageBar to="/resources/blog" label="← Blog" />
        <main id="main-content" className="container blog-post__main">
          <p style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--muted)' }}>Loading…</p>
        </main>
      </div>
    );
  }

  if (isError || !post) return <Navigate to="/resources/blog" replace />;

  const catColor = CATEGORY_COLORS[post.category] || '#0b6e4f';

  return (
    <div className="blog-post-page">
      <PageBar to="/resources/blog" label="← Blog" />

      <Breadcrumbs items={[{ label: 'Blog', to: '/blog' }, { label: post.title }]} />

      <main id="main-content" className="container blog-post__main">
        <div className="blog-post__hero">
          <span className="blog-card__cat" style={{ background: catColor }}>
            {post.category}
          </span>
          <h1>{post.title}</h1>
          <p className="blog-post__date">{post.date} · Al-Rahma Academy</p>
        </div>

        <article className="blog-post__body">
          {renderMarkdown(post.content)}
        </article>

        {(prev || next) && (
          <nav className="blog-post__nav">
            {prev && (
              <Link to={`/blog/${prev.slug}`} className="blog-post__nav-link blog-post__nav-link--prev">
                <span className="blog-post__nav-dir">← Previous</span>
                <span className="blog-post__nav-title">{prev.title}</span>
              </Link>
            )}
            {next && (
              <Link to={`/blog/${next.slug}`} className="blog-post__nav-link blog-post__nav-link--next">
                <span className="blog-post__nav-dir">Next →</span>
                <span className="blog-post__nav-title">{next.title}</span>
              </Link>
            )}
          </nav>
        )}

        <div className="blog-post__cta">
          <h3>Ready to start your Quran journey?</h3>
          <p>Book a free trial session with one of our certified teachers — no commitment required.</p>
          <Link to="/#trial" className="btn btn--green">Book a Free Trial</Link>
        </div>
      </main>
    </div>
  );
}
