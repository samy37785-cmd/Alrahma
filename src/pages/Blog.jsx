import { Link } from 'react-router-dom';
import Brand from '../components/Brand';

const posts = [
  {
    slug: 'how-to-start-learning-quran',
    title: 'How to Start Learning the Quran as an Adult with No Arabic Background',
    date: 'June 2025',
    category: 'Beginners',
    excerpt: 'Many adults feel it is too late to start. It is not. Here is the step-by-step path from zero Arabic knowledge to fluent Quran reading.',
  },
  {
    slug: 'what-is-tajweed',
    title: 'What is Tajweed? A Complete Beginner Guide for English Speakers',
    date: 'May 2025',
    category: 'Tajweed',
    excerpt: 'Tajweed is the set of rules governing correct Quranic pronunciation. This guide explains the basics in plain English with real examples.',
  },
  {
    slug: 'noorani-qaida-explained',
    title: 'Noorani Qaida Explained: The First Step to Reading the Quran',
    date: 'May 2025',
    category: 'Beginners',
    excerpt: 'Noorani Qaida is the universally recommended starting point for Quran reading. Learn what it covers and how long it takes.',
  },
  {
    slug: 'how-long-to-memorise-quran',
    title: 'How Long Does It Take to Memorise the Entire Quran?',
    date: 'April 2025',
    category: 'Hifz',
    excerpt: 'The answer depends on age, daily commitment, and method. We break down realistic timelines for children and adults.',
  },
  {
    slug: 'online-vs-in-person-quran',
    title: 'Online vs In-Person Quran Classes: Which is Better for Kids?',
    date: 'April 2025',
    category: 'Parents',
    excerpt: 'Both options have clear advantages. We compare them honestly so you can make the right decision for your child.',
  },
  {
    slug: 'impara-corano-online-italiano',
    title: 'Come imparare il Corano a casa: guida per principianti italiani',
    date: 'March 2025',
    category: 'Italiano',
    excerpt: 'Una guida pratica per i musulmani in Italia che vogliono iniziare a studiare il Corano online senza esperienza pregressa.',
  },
];

const CATEGORY_COLORS = {
  Beginners: '#0b6e4f',
  Tajweed:   '#6b3fa0',
  Hifz:      '#c9662c',
  Parents:   '#1a6aa5',
  Italiano:  '#b8342a',
};

export default function Blog() {
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
            <article className="blog-card" key={p.slug}>
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
                <span className="blog-card__coming">Coming soon</span>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
