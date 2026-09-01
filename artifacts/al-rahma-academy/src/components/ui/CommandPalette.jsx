import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';

// Stage 2A (see docs/user-admin-auth-contract.md): no teacher/parent
// destinations any more - /teacher and /parent just redirect to the
// generic Dashboard now, so they are not worth listing separately here.
// Stage 2C Final Corrective: the regular-account entry used to be labeled
// 'studentDashboard' ("Student dashboard") - a raw legacy role string
// shown as UI copy, even though every regular account is just 'user'.
// Renamed to the generic 'dashboard' key.
const STATIC_ITEMS = [
  { group: 'navigation', icon: '◧', label: 'dashboard', to: '/dashboard', role: 'user' },
  { group: 'navigation', icon: '◧', label: 'adminDashboard', to: '/admin', role: 'admin' },
  { group: 'navigation', icon: '✉', label: 'messages', to: '/messages' },
  { group: 'navigation', icon: '💳', label: 'billing', to: '/billing' },
  { group: 'navigation', icon: '👤', label: 'profile', to: '/profile' },
  { group: 'tools', icon: '📖', label: 'quranReader', to: '/tools/quran-reader' },
  { group: 'tools', icon: '🕌', label: 'prayerTimes', to: '/tools/prayer-times' },
  { group: 'tools', icon: '📿', label: 'tasbeeh', to: '/tools/tasbeeh' },
  { group: 'tools', icon: '🧭', label: 'qibla', to: '/tools/qibla' },
  { group: 'tools', icon: '📅', label: 'calendar', to: '/tools/islamic-calendar' },
  { group: 'tools', icon: '🔤', label: 'alphabet', to: '/tools/arabic-alphabet' },
  { group: 'resources', icon: '📝', label: 'blog', to: '/resources/blog' },
  { group: 'resources', icon: '❓', label: 'faq', to: '/resources/faq' },
  { group: 'courses', icon: '📚', label: 'quranCourses', to: '/courses/quran' },
  { group: 'courses', icon: '📚', label: 'arabicCourses', to: '/courses/arabic' },
  { group: 'courses', icon: '📚', label: 'ijazah', to: '/courses/ijazah' },
];

export default function CommandPalette({ onClose }) {
  // isAdmin is proven exclusively by the real AdminUser + MFA session, never
  // by the regular account's own `role` field. See src/utils/accountRoles.js.
  const { isAdmin } = useAdminAuth();
  const { lang } = useLang();
  const navigate   = useNavigate();
  const inputRef   = useRef(null);
  const listRef    = useRef(null);
  const [query, setQuery]     = useState('');
  const [cursor, setCursor]   = useState(0);
  const copy = getExperienceText(lang).command;

  const role = isAdmin ? 'admin' : 'user';
  const items = STATIC_ITEMS.map((item) => ({
    ...item,
    group: copy.groups[item.group],
    label: copy.items[item.label],
  }));

  const filtered = items.filter((item) => {
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
    <div className="ds-cmd-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={copy.dialog}>
      <div className="ds-cmd" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="ds-cmd__search">
          <span className="ds-cmd__search-icon">🔍</span>
          <input
            ref={inputRef}
            className="ds-cmd__input"
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={copy.close}
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
              {copy.noResults(query)}
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
          <span className="ds-cmd__hint"><kbd>↑↓</kbd> {copy.navigate}</span>
          <span className="ds-cmd__hint"><kbd>↵</kbd> {copy.go}</span>
          <span className="ds-cmd__hint"><kbd>Esc</kbd> {copy.close}</span>
        </div>
      </div>
    </div>
  );
}
