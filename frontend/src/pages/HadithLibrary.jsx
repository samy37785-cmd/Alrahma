import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Reveal from '../components/ui/Reveal';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';

const CDN  = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const PER  = 25;

const COLLECTIONS = [
  {
    id: 'nawawi', slug: 'nawawi',
    label: "Al-Arba'een Al-Nawawiyyah", ar: 'الأربعون النووية',
    author: { en: 'Imam Yahya Al-Nawawi (d. 676 AH)', ar: 'الإمام يحيى النووي (ت ٦٧٦هـ)' },
    count: 42, color: '#0b6e4f', icon: '📜',
    note: { en: 'The 42 most essential hadiths — the foundation of every Muslim student', ar: 'الأحاديث الـ ٤٢ الأساسية — ركيزة كل طالب مسلم' },
  },
  {
    id: 'qudsi', slug: 'qudsi',
    label: 'Forty Hadith Qudsi', ar: 'الأربعون حديثاً قدسياً',
    author: { en: 'Various (words of Allah narrated by the Prophet ﷺ)', ar: 'أحاديث قدسية — كلام الله برواية النبي ﷺ' },
    count: 40, color: '#7a3a8a', icon: '✨',
    note: { en: "Divine speech narrated by the Prophet ﷺ — Allah's words beyond the Quran", ar: 'كلام الله تعالى المنقول على لسان النبي ﷺ خارج نطاق القرآن' },
  },
  {
    id: 'dehlawi', slug: 'dehlawi',
    label: 'Forty Hadith (Shah Waliullah)', ar: 'الأربعون — شاه ولي الله الدهلوي',
    author: { en: 'Shah Waliullah Dehlawi (d. 1176 AH)', ar: 'شاه ولي الله الدهلوي (ت ١١٧٦هـ)' },
    count: 40, color: '#2a6a80', icon: '📗',
    note: { en: 'Selected by the great Indian Islamic scholar — covering faith, ethics and worship', ar: 'اختيار العالم الإسلامي الهندي الكبير — يغطي العقيدة والأخلاق والعبادة' },
  },
  {
    id: 'bukhari', slug: 'bukhari',
    label: 'Sahih Al-Bukhari', ar: 'صحيح البخاري',
    author: { en: 'Imam Muhammad ibn Ismail Al-Bukhari (d. 256 AH)', ar: 'الإمام محمد بن إسماعيل البخاري (ت ٢٥٦هـ)' },
    count: 7563, color: '#1a5fa0', icon: '📘',
    note: { en: 'The most authentic book after the Quran — 7,563 hadiths, 97 books', ar: 'أصح كتاب بعد القرآن الكريم — ٧٥٦٣ حديثاً في ٩٧ كتاباً' },
  },
  {
    id: 'muslim', slug: 'muslim',
    label: 'Sahih Muslim', ar: 'صحيح مسلم',
    author: { en: 'Imam Muslim ibn Al-Hajjaj (d. 261 AH)', ar: 'الإمام مسلم بن الحجاج (ت ٢٦١هـ)' },
    count: 3033, color: '#c07020', icon: '📙',
    note: { en: 'The second most authentic hadith collection — praised for its superior organisation', ar: 'ثاني أصح مجموعة أحاديث — مشهود له بحسن الترتيب والتنظيم' },
  },
  {
    id: 'abudawud', slug: 'abudawud',
    label: 'Sunan Abi Dawud', ar: 'سنن أبي داود',
    author: { en: 'Imam Abu Dawud Al-Sijistani (d. 275 AH)', ar: 'الإمام أبو داود السجستاني (ت ٢٧٥هـ)' },
    count: 5274, color: '#8a3a2a', icon: '📕',
    note: { en: "5,274 hadiths focused on Islamic jurisprudence — the Fiqh student's essential reference", ar: '٥٢٧٤ حديثاً تركّز على الفقه الإسلامي — المرجع الأساسي لطالب الفقه' },
  },
  {
    id: 'tirmidhi', slug: 'tirmidhi',
    label: "Jami' At-Tirmidhi", ar: 'جامع الترمذي',
    author: { en: 'Imam Muhammad Al-Tirmidhi (d. 279 AH)', ar: 'الإمام محمد الترمذي (ت ٢٧٩هـ)' },
    count: 3956, color: '#2a8050', icon: '📒',
    note: { en: 'Notable for grading hadiths (Sahih/Hasan/Da\'eef) — essential for hadith sciences', ar: 'مميّز بتصنيف الأحاديث (صحيح/حسن/ضعيف) — ضروري لعلوم الحديث' },
  },
  {
    id: 'ibnmajah', slug: 'ibnmajah',
    label: 'Sunan Ibn Majah', ar: 'سنن ابن ماجه',
    author: { en: 'Imam Ibn Majah Al-Qazwini (d. 273 AH)', ar: 'الإمام ابن ماجه القزويني (ت ٢٧٣هـ)' },
    count: 4341, color: '#6a3a10', icon: '📓',
    note: { en: 'The sixth of the six canonical hadith books — covers all major topics of Fiqh', ar: 'السادس من الكتب الستة الصحاح — يغطي جميع الموضوعات الفقهية الكبرى' },
  },
  {
    id: 'nasai', slug: 'nasai',
    label: "Sunan An-Nasa'i", ar: 'سنن النسائي',
    author: { en: "Imam Ahmad An-Nasa'i (d. 303 AH)", ar: 'الإمام أحمد النسائي (ت ٣٠٣هـ)' },
    count: 5761, color: '#1a6a60', icon: '📔',
    note: { en: "Known for its strict conditions in narrator acceptance — one of the 'Kutub Al-Sittah'", ar: "مشهور بصرامة شروطه في قبول الرواة — من الكتب الستة الصحاح" },
  },
  {
    id: 'malik', slug: 'malik',
    label: 'Muwatta Imam Malik', ar: 'موطأ الإمام مالك',
    author: { en: 'Imam Malik ibn Anas (d. 179 AH)', ar: 'الإمام مالك بن أنس (ت ١٧٩هـ)' },
    count: 1832, color: '#5a3a7a', icon: '📋',
    note: { en: 'The earliest major hadith collection — also the foundational text of the Maliki school', ar: 'أقدم مجموعة حديثية كبرى — والمصدر التأسيسي للمذهب المالكي' },
  },
  {
    id: 'riyadussalihin', slug: 'riyadussalihin',
    label: 'Riyad As-Salihin', ar: 'رياض الصالحين',
    author: { en: 'Imam Yahya Al-Nawawi (d. 676 AH)', ar: 'الإمام يحيى النووي (ت ٦٧٦هـ)' },
    count: 1903, color: '#1a8a5a', icon: '🌿',
    note: { en: 'The most widely-read hadith collection in daily Islamic life — covering manners, worship and character', ar: 'أكثر مجموعة حديثية تداولاً في الحياة اليومية — تغطي الآداب والعبادة والأخلاق' },
  },
  {
    id: 'adab', slug: 'adab',
    label: "Al-Adab Al-Mufrad", ar: 'الأدب المفرد',
    author: { en: 'Imam Muhammad Al-Bukhari (d. 256 AH)', ar: 'الإمام محمد البخاري (ت ٢٥٦هـ)' },
    count: 1338, color: '#8a5a20', icon: '🌸',
    note: { en: "Al-Bukhari's dedicated collection on Islamic manners and character — a companion to Sahih Bukhari", ar: 'مجموعة البخاري المخصصة للآداب الإسلامية والأخلاق — رفيقة صحيح البخاري' },
  },
  {
    id: 'bulugh', slug: 'bulugh',
    label: 'Bulugh Al-Maram', ar: 'بلوغ المرام',
    author: { en: 'Imam Ibn Hajar Al-Asqalani (d. 852 AH)', ar: 'الإمام ابن حجر العسقلاني (ت ٨٥٢هـ)' },
    count: 1596, color: '#2a4a8a', icon: '⚖️',
    note: { en: 'The essential Fiqh hadith reference — every hadith graded and sourced by Ibn Hajar with expert precision', ar: 'المرجع الحديثي الأساسي في الفقه — كل حديث مُخرَّج ومُصنَّف بدقة ابن حجر' },
  },
];

export default function HadithLibrary() {
  const { lang, t } = useLang();
  const isAr = lang === 'ar';
  const h = t.hadith;

  const [selected, setSelected]   = useState(null);
  const [hadiths,  setHadiths]    = useState({ en: [], ar: [] });
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
    setHadiths({ en: [], ar: [] });
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
      setHadiths({ en: enData.hadiths || [], ar: arData.hadiths || [] });
    } catch {
      setError(h.failedLoad);
    }
    setLoading(false);
  }, [h.failedLoad]);

  // Pair English + Arabic hadiths
  const paired = useMemo(() => {
    const len = Math.max(hadiths.en.length, hadiths.ar.length);
    return Array.from({ length: len }, (_, i) => ({
      en: hadiths.en[i] || {},
      ar: hadiths.ar[i] || {},
    }));
  }, [hadiths]);

  const filtered = useMemo(() => {
    if (!search.trim()) return paired;
    const q = search.toLowerCase();
    return paired.filter(({ en, ar }) =>
      en.text?.toLowerCase().includes(q) ||
      ar.text?.includes(q) ||
      String(en.hadithnumber).includes(q)
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
        <Breadcrumbs items={[{ label: 'Tools', to: '/tools' }, { label: t.nav.hadith }]} />
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
              {selected
                ? (isAr ? selected.ar : selected.label)
                : h.heroTitle
              }
            </h1>
            <p className="hl__hero-sub">
              {selected
                ? (isAr ? selected.author.ar : selected.author.en)
                : h.heroSub
              }
            </p>
            {selected && (
              <div className="hl__hero-meta">
                <span>{selected.count.toLocaleString()} {h.hadiths}</span>
                <span>·</span>
                <span>{isAr ? selected.note.ar : selected.note.en}</span>
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
                <Link to="/course/islamic-studies" className="hl__course-note-link">
                  {h.courseLink}
                </Link>
                {h.courseClick}
              </span>
            </div>
          )}

          {/* ── Collection grid ── */}
          {!selected && (
            <Reveal className="hl__grid">
              {COLLECTIONS.map((col) => (
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
                    <span className="hl__card-author">{isAr ? col.author.ar : col.author.en}</span>
                    <span className="hl__card-note">{isAr ? col.note.ar : col.note.en}</span>
                    <span className="hl__card-cta">{h.browse}</span>
                  </div>
                </button>
              ))}
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
                  dir={isAr ? 'rtl' : 'ltr'}
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
                  <p>{h.loading.replace('{book}', isAr ? selected.ar : selected.label)}</p>
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
                  {paginated.map(({ en, ar }, idx) => (
                    <article key={en.hadithnumber ?? idx} className="hl__hadith">
                      <div className="hl__hadith-num" style={{ background: selected.color }}>
                        {en.hadithnumber ?? idx + 1}
                      </div>
                      <div className="hl__hadith-body">
                        {(display === 'ar' || display === 'both') && ar.text && (
                          <p className="hl__hadith-ar" dir="rtl">{ar.text}</p>
                        )}
                        {display === 'both' && ar.text && en.text && (
                          <hr className="hl__hadith-divider" />
                        )}
                        {(display === 'en' || display === 'both') && en.text && (
                          <p className="hl__hadith-en">{en.text}</p>
                        )}
                        {en.grades?.length > 0 && (
                          <div className="hl__hadith-grades">
                            {en.grades.map((g) => (
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
              {!loading && !error && filtered.length === 0 && hadiths.en.length > 0 && (
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
              <Link to="/course/islamic-studies" className="btn btn--gold btn--lg">
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
