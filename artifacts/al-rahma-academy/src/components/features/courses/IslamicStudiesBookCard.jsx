import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function IslamicStudiesBookCard({ book, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cl__book${open ? ' open' : ''}`}>
      <button className="cl__book-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="cl__book-icon">{book.icon}</span>
        <div className="cl__book-info">
          <strong>{book.title}</strong>
          <span className="cl__book-ar" dir="rtl">{book.ar}</span>
          <span className="cl__book-author">{text.author}</span>
          <span className="cl__book-note">{text.module}</span>
        </div>
        <span className="cl__book-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="cl__book-body">
          <p className="cl__book-desc">{text.desc}</p>
          <ul className="cl__book-topics">
            {text.topics.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {book.link
            ? <a href={book.link} target="_blank" rel="noreferrer" className="cl__book-link">{text.linkLabel} ↗</a>
            : <span className="cl__book-link cl__book-link--muted">📚 {text.linkLabel}</span>
          }
          {text.libraryNote && (
            <Link to="/hadith-library" className="cl__book-library-link">
              {text.libraryNote} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
