import { useState, useEffect, useCallback } from 'react';
import '../styles/adhkar.css';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { ADHKAR_TR, sourceTr } from '../i18n/adhkarText';

import { ADHKAR, CATEGORY_KEYS } from '../data/adhkarData';
import Breadcrumbs from '../components/ui/Breadcrumbs';


/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function Adhkar() {
  const { t, lang } = useLang();
  const a = t.adhkar;
  const isAr = lang === 'ar';
  const catName = (key) => a.categories[key] || ADHKAR[key].title;

  useSEO({
    title: a.heading,
    description: a.sub,
  });

  const [cat,    setCat]    = useState('sabah');
  const [search, setSearch] = useState('');

  /* localStorage persistence */
  const [done,   setDone]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('adhkar-done') || '{}'); } catch { return {}; }
  });
  const [counts, setCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('adhkar-counts') || '{}'); } catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('adhkar-done',   JSON.stringify(done));   }, [done]);
  useEffect(() => { localStorage.setItem('adhkar-counts', JSON.stringify(counts)); }, [counts]);

  const toggleDone = useCallback((id) => setDone((d) => ({ ...d, [id]: !d[id] })), []);

  const tap = useCallback((id) => {
    setCounts((c) => {
      const n = (c[id] || 0) + 1;
      if (navigator.vibrate) navigator.vibrate(20);
      return { ...c, [id]: n };
    });
  }, []);

  const resetItem = useCallback((id) => {
    setCounts((c) => { const n = { ...c }; delete n[id]; return n; });
    setDone((d)   => { const n = { ...d }; delete n[id]; return n; });
  }, []);

  const resetAll = () => {
    setDone({}); setCounts({});
    localStorage.removeItem('adhkar-done');
    localStorage.removeItem('adhkar-counts');
  };

  /* Filtered items for search */
  const searchLower = search.trim().toLowerCase();
  const filteredCats = searchLower
    ? CATEGORY_KEYS.map((key) => ({
        key,
        items: ADHKAR[key].items.filter(
          (item) => item.ar.includes(search.trim()) || (item.fadl || '').toLowerCase().includes(searchLower)
        ),
      })).filter((c) => c.items.length > 0)
    : [{ key: cat, items: ADHKAR[cat].items }];

  const activeCat = ADHKAR[cat];
  const doneCount = activeCat.items.filter((i) => done[i.id]).length;
  const totalDone = Object.values(done).filter(Boolean).length;

  return (
    <>
      <Header />
      <Breadcrumbs items={[{ label: 'Tools', to: '/tools' }, { label: isAr ? 'الأذكار' : 'Adhkar' }]} />
      <main id="main-content" className="adhkar__main">

        {/* Hero */}
        <section className="adhkar__hero">
          <div className="container adhkar__hero-inner">
            <p className="eyebrow">{a.eyebrow}</p>
            <h1>{a.heading}</h1>
            <p className="adhkar__hero-sub">{a.sub}</p>
            {totalDone > 0 && (
              <div className="adhkar__hero-progress">
                <span>{a.doneToday} {totalDone}</span>
                <button className="adhkar__reset-all" onClick={resetAll}>{a.resetAll}</button>
              </div>
            )}
          </div>
        </section>

        <div className="container adhkar__layout">

          {/* Category sidebar */}
          <aside className="adhkar__sidebar">
            <div className="adhkar__search-wrap">
              <input
                className="adhkar__search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={a.searchPlaceholder}
                dir={isAr ? 'rtl' : 'ltr'}
              />
              {search && (
                <button className="adhkar__search-clear" onClick={() => setSearch('')}>✕</button>
              )}
            </div>

            <nav className="adhkar__cats">
              {CATEGORY_KEYS.map((key) => {
                const c = ADHKAR[key];
                const dCnt = c.items.filter((i) => done[i.id]).length;
                return (
                  <button
                    key={key}
                    className={`adhkar__cat-btn${cat === key && !search ? ' active' : ''}`}
                    onClick={() => { setCat(key); setSearch(''); }}
                    style={{ '--cat-color': c.color }}
                  >
                    <span className="adhkar__cat-icon">{c.icon}</span>
                    <span className="adhkar__cat-name">{catName(key)}</span>
                    {dCnt > 0 && (
                      <span className="adhkar__cat-badge">{dCnt}/{c.items.length}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <section className="adhkar__content">
            {!search && (
              <div className="adhkar__cat-header" style={{ '--cat-color': activeCat.color }}>
                <span className="adhkar__ch-icon">{activeCat.icon}</span>
                <div>
                  <h2 className="adhkar__ch-title">{catName(cat)}</h2>
                  <p className="adhkar__ch-progress">
                    {doneCount} / {activeCat.items.length} {a.complete}
                  </p>
                </div>
                <div className="adhkar__ch-bar-wrap">
                  <div className="adhkar__ch-bar" style={{ width: `${Math.round(doneCount / activeCat.items.length * 100)}%`, background: 'var(--cat-color)' }} />
                </div>
              </div>
            )}

            {search && filteredCats.length === 0 && (
              <div className="adhkar__no-results">
                <p>{a.noResults} &quot;{search}&quot;</p>
              </div>
            )}

            {filteredCats.map(({ key, items }) => (
              <div key={key}>
                {search && <h3 className="adhkar__search-cat-title">{ADHKAR[key].icon} {catName(key)}</h3>}
                <div className="adhkar__list">
                  {items.map((item, idx) => {
                    const itemDone  = done[item.id]   || false;
                    const itemCount = counts[item.id] || 0;
                    const target    = typeof item.count === 'number' ? item.count : null;
                    const reachedTarget = target && itemCount >= target;
                    const tr        = !isAr ? (ADHKAR_TR[item.id]?.[lang] || ADHKAR_TR[item.id]?.en) : null;
                    const ctx       = isAr ? item.context : tr?.context;
                    const fadl      = isAr ? item.fadl : tr?.fadl;

                    return (
                      <div
                        key={item.id}
                        className={`adhkar__card${itemDone ? ' done' : ''}${reachedTarget ? ' reached' : ''}`}
                        style={{ '--cat-color': ADHKAR[key].color }}
                      >
                        {/* Number */}
                        <div className="adhkar__card-num">{idx + 1}</div>

                        {/* Context badge */}
                        {ctx && (
                          <div className="adhkar__context-badge">{ctx}</div>
                        )}

                        {/* Arabic text (always shown — to be recited) */}
                        <p className="adhkar__ar" dir="rtl" lang="ar">{item.ar}</p>

                        {/* Translation / meaning for non-Arabic readers */}
                        {tr?.meaning && (
                          <p className="adhkar__translation" dir="ltr">{tr.meaning}</p>
                        )}

                        {/* Benefit */}
                        {fadl && (
                          <p className="adhkar__fadl" dir={isAr ? 'rtl' : 'ltr'}>💡 {fadl}</p>
                        )}

                        {/* Footer */}
                        <div className="adhkar__card-footer">
                          <div className="adhkar__meta">
                            <span className="adhkar__source">📖 {sourceTr(item.source, lang)}</span>
                            <span className="adhkar__count-target">
                              {typeof item.count === 'number' ? `${item.count}×` : item.count}
                            </span>
                          </div>

                          <div className="adhkar__actions">
                            {/* Tap counter */}
                            <button
                              className={`adhkar__tap${reachedTarget ? ' adhkar__tap--done' : ''}`}
                              onClick={() => tap(item.id)}
                              title={a.tapTitle}
                            >
                              {reachedTarget ? '✓' : itemCount > 0 ? itemCount : '◉'}
                            </button>

                            {/* Reset item */}
                            {(itemCount > 0 || itemDone) && (
                              <button className="adhkar__reset-btn" onClick={() => resetItem(item.id)} title={a.resetTitle}>
                                ↺
                              </button>
                            )}

                            {/* Done toggle */}
                            <button
                              className={`adhkar__done-btn${itemDone ? ' on' : ''}`}
                              onClick={() => toggleDone(item.id)}
                              title={itemDone ? a.unmarkDone : a.markDone}
                            >
                              {itemDone ? a.doneBtn : a.notDoneBtn}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
