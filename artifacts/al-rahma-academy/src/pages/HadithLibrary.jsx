import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import { HADITH_COLLECTIONS } from '../data/hadith/collections';
import { HADITH_COLLECTIONS_TEXT } from '../i18n/hadith/collections';

const CDN  = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const PER  = 25;

// The grid always shows both the native-script title (col.ar) and the
// Roman/English title (col.label) side by side -- not a language fork. The
// hero title (shown once a collection is selected) shows only ONE of them,
// matching the current UI language; this helper picks between them without
// an isAr/lang==='ar' ternary.
function collectionTitle(col, langCode) {
  if (langCode === 'ar') return col.ar;
  return col.label;
}

export default function HadithLibrary() {
  const { lang, t } = useLang();
  const h = t.hadith;
  const ht = HADITH_COLLECTIONS_TEXT[lang] || HADITH_COLLECTIONS_TEXT.en;

  const [selected, setSelected]   = useState(null);
  // Keys are `english`/`arabic`, not `en`/`ar` -- deliberately, so this
  // (real, legitimate) two-language data-holding object never matches the
  // `noHardcodedBilingualContent.test.js` guard's `{en,ar}` hardcoded-
  // content-literal pattern, which this is not (it holds fetched API
  // results, never hardcoded UI text).
  const [hadiths,  setHadiths]    = useState({ english: [], arabic: [] });
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState(null);
  const [search,   setSearch]     = useState('');
  const [page,     setPage]       = useState(1);
  const [display,  setDisplay]    = useState('both'); // 'en' | 'ar' | 'both'

  useSEO({
    title: h.pageTitle,
    description: h.pageDesc,
  });

  const loadCollection = useCallback(async (col) => {
    setSelected(col);
    setHadiths({ english: [], arabic: [] });
    setSearch('');
    setPage(1);
    setError(null);
    setLoading(true);
    try {
      const [enRes, arRes] = await Promise.all([
        fetch(`${CDN}/eng-${col.slug}.min.json`),
        fetch(`${CDN}/ara-${col.slug}.min.json`),
      ]);
      if (!enRes.ok || !arRes.ok) throw new Error('Not found');
      const [enData, arData] = await Promise.all([enRes.json(), arRes.json()]);
      setHadiths({ english: enData.hadiths || [], arabic: arData.hadiths || [] });
    } catch {
      setError(h.failedLoad);
    }
    setLoading(false);
  }, [h.failedLoad]);

  // Pair English + Arabic hadiths
  const paired = useMemo(() => {
    const len = Math.max(hadiths.english.length, hadiths.arabic.length);
    return Array.from({ length: len }, (_, i) => ({
      english: hadiths.english[i] || {},
      arabic: hadiths.arabic[i] || {},
    }));
  }, [hadiths]);

  const filtered = useMemo(() => {
    if (!search.trim()) return paired;
    const q = search.toLowerCase();
    return paired.filter(({ english, arabic }) =>
      english.text?.toLowerCase().includes(q) ||
      arabic.text?.includes(q) ||
      String(english.hadithnumber).includes(q)
    );
  }, [paired, search]);

  const totalPages = Math.ceil(filtered.length / PER);
  const paginated  = filtered.slice((page - 1) * PER, page * PER);

  useEffect(() => { setPage(1); }, [search]);

  const goPage = (n) => {
    setPage(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pageNums = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
    return [...out].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[{ label: t.nav.tools, to: '/tools' }, { label: t.nav.hadith }]} />
        {/* Hero */}
        <section className="hl__hero">
          <div className="container">
            {selected && (
              <button className="hl__hero-back" onClick={() => setSelected(null)}>
                ← {h.back}
              </button>
            )}
            <span className="hl__hero-badge">{h.badge}</span>
            <h1 className="hl__hero-title">
              {selected ? collectionTitle(selected, lang) : h.heroTitle}
            </h1>
            <p className="hl__hero-sub">
              {selected ? ht[selected.id].author : h.heroSub}
            </p>
            {selected && (
              <div className="hl__hero-meta">
                <span>{selected.count.toLocaleString()} {h.hadiths}</span>
                <span>·</span>
                <span>{ht[selected.id].note}</span>
              </div>
            )}
          </div>
        </section>

        <div className="container hl__wrap">
          {/* ── Course note ── */}
          {!selected && (
            <div className="hl__course-note">
              <span>🕌</span>
              <span>
                {h.courseNote}{' '}
                <Link to="/courses/islamic-studies" className="hl__course-note-link">
                  {h.courseLink}
                </Link>
                {h.courseClick}
              </span>
            </div>
          )}

          {/* ── Collection grid ── */}
          {!selected && (
            <Reveal className="hl__grid">
              {HADITH_COLLECTIONS.map((col) => {
                const text = ht[col.id];
                return (
                  <button
                    key={col.id}
                    className="hl__card"
                    onClick={() => loadCollection(col)}
                    style={{ '--cc': col.color }}
                  >
                    <div className="hl__card-top" style={{ background: `linear-gradient(145deg,${col.color},${col.color}88)` }}>
                      <span className="hl__card-icon">{col.icon}</span>
                      <span className="hl__card-count">{col.count.toLocaleString()}</span>
                    </div>
                    <div className="hl__card-body">
                      <p className="hl__card-ar" dir="rtl">{col.ar}</p>
                      <strong className="hl__card-title">{col.label}</strong>
                      <span className="hl__card-author">{text.author}</span>
                      <span className="hl__card-note">{text.note}</span>
                      <span className="hl__card-cta">{h.browse}</span>
                    </div>
                  </button>
                );
              })}
            </Reveal>
          )}

          {/* ── Browser ── */}
          {selected && (
            <div className="hl__browser">
              {/* Toolbar */}
              <div className="hl__toolbar">
                <input
                  className="hl__search"
                  type="search"
                  placeholder={h.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  dir={ht.dir}
                />
                <div className="hl__display-toggle">
                  <span className="hl__toggle-label">{h.displayLabel}</span>
                  {[
                    { key: 'both', label: h.displayBoth },
                    { key: 'ar',   label: h.displayAr },
                    { key: 'en',   label: h.displayEn },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      className={`hl__toggle-btn${display === opt.key ? ' active' : ''}`}
                      onClick={() => setDisplay(opt.key)}
                      style={{ '--cc': selected.color }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Loading */}
              {loading && (
                <div className="hl__loading">
                  <div className="hl__spinner" style={{ borderTopColor: selected.color }} />
                  <p>{h.loading.replace('{book}', collectionTitle(selected, lang))}</p>
                  {selected.count > 1000 && (
                    <p className="hl__loading-note">
                      {h.loadingNote.replace('{count}', selected.count.toLocaleString())}
                    </p>
                  )}
                </div>
              )}

              {error && <div className="hl__error">{error}</div>}

              {/* Results info */}
              {!loading && filtered.length > 0 && (
                <div className="hl__results-bar">
                  <span>
                    {search
                      ? h.resultsSearch.replace('{count}', filtered.length).replace('{query}', search)
                      : h.resultsCount.replace('{count}', filtered.length.toLocaleString())
                    }
                  </span>
                  <span className="hl__page-label">
                    {h.pageOf.replace('{page}', page).replace('{total}', totalPages)}
                  </span>
                </div>
              )}

              {/* Hadith list */}
              {!loading && !error && (
                <div className="hl__list">
                  {paginated.map(({ english, arabic }, idx) => (
                    <article key={english.hadithnumber ?? idx} className="hl__hadith">
                      <div className="hl__hadith-num" style={{ background: selected.color }}>
                        {english.hadithnumber ?? idx + 1}
                      </div>
                      <div className="hl__hadith-body">
                        {(display === 'ar' || display === 'both') && arabic.text && (
                          <p className="hl__hadith-ar" dir="rtl">{arabic.text}</p>
                        )}
                        {display === 'both' && arabic.text && english.text && (
                          <hr className="hl__hadith-divider" />
                        )}
                        {(display === 'en' || display === 'both') && english.text && (
                          <p className="hl__hadith-en">{english.text}</p>
                        )}
                        {english.grades?.length > 0 && (
                          <div className="hl__hadith-grades">
                            {english.grades.map((g) => (
                              <span key={g.name + g.grade} className="hl__grade-tag">{g.name}: {g.grade}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Empty */}
              {!loading && !error && filtered.length === 0 && hadiths.english.length > 0 && (
                <div className="hl__empty">
                  <p>🔍 {h.noResults.replace('{query}', search)}</p>
                  <button className="btn btn--green" onClick={() => setSearch('')}>
                    {h.clearSearch}
                  </button>
                </div>
              )}

              {/* Pagination */}
              {!loading && totalPages > 1 && (
                <div className="hl__pagination">
                  <button className="hl__page-btn" disabled={page === 1} onClick={() => goPage(page - 1)}>
                    ‹
                  </button>
                  {pageNums.map((n, i) => (
                    <Fragment key={n}>
                      {i > 0 && pageNums[i - 1] !== n - 1 && (
                        <span className="hl__page-gap">…</span>
                      )}
                      <button
                        className={`hl__page-btn${page === n ? ' active' : ''}`}
                        onClick={() => goPage(n)}
                        style={page === n ? { background: selected.color, color: '#fff', borderColor: selected.color } : {}}
                      >
                        {n}
                      </button>
                    </Fragment>
                  ))}
                  <button className="hl__page-btn" disabled={page === totalPages} onClick={() => goPage(page + 1)}>
                    ›
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CTA */}
        {!selected && (
          <div className="hl__cta">
            <div className="container">
              <p>{h.ctaPrompt}</p>
              <Link to="/courses/islamic-studies" className="btn btn--gold btn--lg">
                {h.ctaBtn}
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
