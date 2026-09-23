import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function IslamicStudiesBookCard({ book, lang }) {
  const [open, setOpen] = useState(false);
  const isAr = lang === 'ar';
  return (
    <div className={`cl__book${open ? ' open' : ''}`}>
      <button className="cl__book-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="cl__book-icon">{book.icon}</span>
        <div className="cl__book-info">
          {/* Language Closure Phase 4 (policy approved by محمود): book.ar is the
              approved primary Arabic title on the Arabic page -- book.title
              (English) was previously shown as primary regardless of lang.
              The secondary Arabic line is now redundant with the primary on
              the Arabic page (would duplicate the same text), so it only
              renders when the primary title is English; no new subtitle
              text is invented for either language. */}
          <strong>{isAr ? book.ar : book.title}</strong>
          {!isAr && <span className="cl__book-ar" dir="rtl">{book.ar}</span>}
          <span className="cl__book-author">{isAr ? book.author.ar : book.author.en}</span>
          <span className="cl__book-note">{isAr ? book.module.ar : book.module.en}</span>
        </div>
        <span className="cl__book-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="cl__book-body">
          <p className="cl__book-desc">{isAr ? book.desc.ar : book.desc.en}</p>
          <ul className="cl__book-topics">
            {(isAr ? book.topics.ar : book.topics.en).map((t) => <li key={t}>{t}</li>)}
          </ul>
          {book.link
            ? <a href={book.link} target="_blank" rel="noreferrer" className="cl__book-link">{isAr ? book.linkLabel.ar : book.linkLabel.en} ↗</a>
            : <span className="cl__book-link cl__book-link--muted">📚 {isAr ? book.linkLabel.ar : book.linkLabel.en}</span>
          }
          {book.libraryNote && (
            <Link to="/hadith-library" className="cl__book-library-link">
              {isAr ? book.libraryNote.ar : book.libraryNote.en} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
