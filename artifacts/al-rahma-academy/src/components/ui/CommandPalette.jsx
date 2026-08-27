import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const STATIC_ITEMS = [
  { group: 'Navigation', icon: '◧', label: 'Student Dashboard',  to: '/dashboard',          role: 'student' },
  { group: 'Navigation', icon: '◧', label: 'Teacher Dashboard',  to: '/teacher',            role: 'teacher' },
  { group: 'Navigation', icon: '◧', label: 'Admin Dashboard',    to: '/admin',              role: 'admin' },
  { group: 'Navigation', icon: '◧', label: 'Parent Dashboard',   to: '/parent',             role: 'parent' },
  { group: 'Navigation', icon: '✉', label: 'Messages',           to: '/messages' },
  { group: 'Navigation', icon: '💳', label: 'Billing & Invoices',to: '/billing' },
  { group: 'Navigation', icon: '👤', label: 'Profile & Settings',to: '/profile' },
  { group: 'Tools',      icon: '📖', label: 'Quran Reader',      to: '/tools/quran-reader' },
  { group: 'Tools',      icon: '🕌', label: 'Prayer Times',      to: '/tools/prayer-times' },
  { group: 'Tools',      icon: '📿', label: 'Tasbeeh Counter',   to: '/tools/tasbeeh' },
  { group: 'Tools',      icon: '🧭', label: 'Qibla Direction',   to: '/tools/qibla' },
  { group: 'Tools',      icon: '📅', label: 'Islamic Calendar',  to: '/tools/islamic-calendar' },
  { group: 'Tools',      icon: '🔤', label: 'Arabic Alphabet',   to: '/tools/arabic-alphabet' },
  { group: 'Resources',  icon: '📝', label: 'Blog',              to: '/resources/blog' },
  { group: 'Resources',  icon: '❓', label: 'FAQ',               to: '/resources/faq' },
  { group: 'Courses',    icon: '📚', label: 'Quran Courses',     to: '/courses/quran' },
  { group: 'Courses',    icon: '📚', label: 'Arabic Courses',    to: '/courses/arabic' },
  { group: 'Courses',    icon: '📚', label: 'Ijazah',            to: '/courses/ijazah' },
];

export default function CommandPalette({ onClose }) {
  const { isAdmin, isTeacher, isParent } = useAuth();
  const navigate   = useNavigate();
  const inputRef   = useRef(null);
  const listRef    = useRef(null);
  const [query, setQuery]     = useState('');
  const [cursor, setCursor]   = useState(0);

  const role = isAdmin ? 'admin' : isTeacher ? 'teacher' : isParent ? 'parent' : 'student';

  const filtered = STATIC_ITEMS.filter((item) => {
    if (item.role && item.role !== role) return false;
    if (!query) return true;
    return item.label.toLowerCase().includes(query.toLowerCase()) ||
           item.group.toLowerCase().includes(query.toLowerCase());
  });

  // Group results
  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const flat = Object.values(grouped).flat();

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [query]);

  const go = (item) => {
    navigate(item.to);
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      if (flat[cursor]) go(flat[cursor]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="ds-cmd-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="ds-cmd" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="ds-cmd__search">
          <span className="ds-cmd__search-icon">🔍</span>
          <input
            ref={inputRef}
            className="ds-cmd__input"
            placeholder="Search pages, tools, courses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div className="ds-cmd__results" ref={listRef}>
          {flat.length === 0 ? (
            <div className="ds-cmd__empty">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="ds-cmd__group-label">{group}</div>
                {items.map((item) => {
                  const idx = flat.indexOf(item);
                  return (
                    <button
                      key={item.to + item.label}
                      className={`ds-cmd__item${cursor === idx ? ' ds-cmd__item--active' : ''}`}
                      onClick={() => go(item)}
                      onMouseEnter={() => setCursor(idx)}
                    >
                      <span className="ds-cmd__item-icon">{item.icon}</span>
                      <span className="ds-cmd__item-label">{item.label}</span>
                      <span className="ds-cmd__item-sub">{item.to}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="ds-cmd__footer">
          <span className="ds-cmd__hint"><kbd>↑↓</kbd> Navigate</span>
          <span className="ds-cmd__hint"><kbd>↵</kbd> Go</span>
          <span className="ds-cmd__hint"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
