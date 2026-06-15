import { useParams, Link, Navigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { posts, CATEGORY_COLORS } from '../data/blogPosts';
import useSEO from '../hooks/useSEO';

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
          {items.map((item, ii) => <li key={ii} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />)}
        </ul>
      );
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    elements.push(
      <p key={key++} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
    );
    i++;
  }

  return elements;
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = posts.find((p) => p.slug === slug);

  useSEO({ title: post?.title, description: post?.excerpt });

  if (!post) return <Navigate to="/blog" replace />;

  const catColor = CATEGORY_COLORS[post.category] || '#0b6e4f';

  return (
    <div className="blog-post-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/blog" className="btn btn--ghost btn--sm">← Blog</Link>
        </div>
      </header>

      <main className="container blog-post__main">
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

        <div className="blog-post__cta">
          <h3>Ready to start your Quran journey?</h3>
          <p>Book a free trial session with one of our certified teachers — no commitment required.</p>
          <Link to="/#trial" className="btn btn--green">Book a Free Trial</Link>
        </div>
      </main>
    </div>
  );
}
