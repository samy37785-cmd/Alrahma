import '../../styles/islamic-tools.css';
import '../../styles/hifz.css';
import { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';

// SM-2 spaced repetition algorithm
function sm2(card, quality) {
  // quality: 0-5 (0-2 = fail, 3-5 = pass)
  let { interval, repetitions, easeFactor } = card;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * 0.08 - (5 - quality) * 0.02);
  }
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  return { interval, repetitions, easeFactor, nextReview: nextReview.toISOString() };
}

// Seed cards stored in localStorage
const STORAGE_KEY = 'alrahma_hifz_cards';

const DEFAULT_CARDS = [
  { id: 'f1', surah: 'Al-Fatiha', verse: 1, arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', hint: 'Bismillah…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'f2', surah: 'Al-Fatiha', verse: 2, arabic: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', hint: 'Al-hamdu…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'f3', surah: 'Al-Fatiha', verse: 3, arabic: 'الرَّحْمَٰنِ الرَّحِيمِ', hint: 'Ar-rahman…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'f4', surah: 'Al-Fatiha', verse: 4, arabic: 'مَالِكِ يَوْمِ الدِّينِ', hint: 'Maliki…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'f5', surah: 'Al-Fatiha', verse: 5, arabic: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ', hint: 'Iyyaka…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'f6', surah: 'Al-Fatiha', verse: 6, arabic: 'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ', hint: 'Ihdina…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'f7', surah: 'Al-Fatiha', verse: 7, arabic: 'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ', hint: 'Sirata…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'i1', surah: 'Al-Ikhlas', verse: 1, arabic: 'قُلْ هُوَ اللَّهُ أَحَدٌ', hint: 'Qul hu…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'i2', surah: 'Al-Ikhlas', verse: 2, arabic: 'اللَّهُ الصَّمَدُ', hint: 'Allahu…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'i3', surah: 'Al-Ikhlas', verse: 3, arabic: 'لَمْ يَلِدْ وَلَمْ يُولَدْ', hint: 'Lam ya…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
  { id: 'i4', surah: 'Al-Ikhlas', verse: 4, arabic: 'وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ', hint: 'Walam…', interval: 1, repetitions: 0, easeFactor: 2.5, nextReview: new Date().toISOString() },
];

function loadCards() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_CARDS;
  } catch { return DEFAULT_CARDS; }
}

function saveCards(cards) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); } catch { /* ignore */ }
}

function getDueCards(cards) {
  const now = new Date();
  return cards.filter((c) => new Date(c.nextReview) <= now);
}

const QUALITY_LABELS = [
  { q: 5, label: 'Perfect', color: '#0a7a56' },
  { q: 4, label: 'Good', color: '#4ade80' },
  { q: 3, label: 'OK', color: '#c8842a' },
  { q: 1, label: 'Hard', color: '#f97316' },
  { q: 0, label: 'Forgot', color: '#c0392b' },
];

export default function HifzReviewPage() {
  const { lang } = useLang();
  const isAr = lang === 'ar';
  useSEO({
    title: isAr ? 'مراجعة الحفظ بالتكرار المتباعد' : 'Hifz Spaced Repetition',
    description: isAr
      ? 'راجع محفوظاتك بنظام التكرار المتباعد SM-2 لتثبيت القرآن الكريم في الذاكرة'
      : 'Review your Hifz using SM-2 spaced repetition to commit Quran to long-term memory',
  });

  const [cards, setCards] = useState(loadCards);
  const [session, setSession] = useState(null); // array of cards to review today
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

  const due = getDueCards(cards);

  const startSession = useCallback(() => {
    setSession([...due]);
    setIdx(0);
    setRevealed(false);
    setDone(false);
  }, [due]);

  const handleQuality = useCallback((quality) => {
    const card = session[idx];
    const updated = sm2(card, quality);
    const newCards = cards.map((c) => c.id === card.id ? { ...c, ...updated } : c);
    setCards(newCards);
    saveCards(newCards);

    const nextIdx = idx + 1;
    if (nextIdx >= session.length) {
      setDone(true);
    } else {
      setIdx(nextIdx);
      setRevealed(false);
    }
  }, [cards, idx, session]);

  useEffect(() => { saveCards(cards); }, [cards]);

  const resetAll = () => {
    const reset = DEFAULT_CARDS;
    setCards(reset);
    saveCards(reset);
    setSession(null);
    setDone(false);
  };

  // Summary screen
  if (done) {
    return (
      <>
        <Header />
        <main id="main-content" style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div className="hifz__done-card">
            <div style={{ fontSize: '3rem' }}>🎉</div>
            <h2>{isAr ? 'أحسنت! جلسة المراجعة اكتملت' : "Session complete — well done!"}</h2>
            <p style={{ color: 'var(--muted)' }}>
              {isAr
                ? `راجعت ${session.length} آية. ستعود البطاقات في مواعيدها المجدولة.`
                : `You reviewed ${session.length} verse${session.length !== 1 ? 's' : ''}. Cards will return on their scheduled dates.`}
            </p>
            <button type="button" className="btn btn--green" onClick={() => setSession(null)}>
              {isAr ? 'العودة للرئيسية' : 'Back to overview'}
            </button>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // Review session
  if (session) {
    const card = session[idx];
    return (
      <>
        <Header />
        <main id="main-content">
          <section className="container hifz__session" style={{ maxWidth: 640, paddingBottom: 80 }}>
            <div className="hifz__progress-bar">
              <div className="hifz__progress-fill" style={{ width: `${(idx / session.length) * 100}%` }} />
            </div>
            <p className="hifz__session-counter">
              {idx + 1} / {session.length} &nbsp;·&nbsp; {card.surah}
            </p>

            <div className="hifz__flash-card">
              <p className="hifz__verse-num">{isAr ? 'الآية' : 'Verse'} {card.verse}</p>
              {revealed
                ? <p className="hifz__arabic" dir="rtl" lang="ar">{card.arabic}</p>
                : (
                  <>
                    <p className="hifz__hint">{card.hint}</p>
                    <p className="hifz__hint-label">{isAr ? '(ابدأ الآية…)' : '(beginning of the verse…)'}</p>
                  </>
                )}
            </div>

            {!revealed ? (
              <button
                type="button"
                className="btn btn--green btn--block"
                onClick={() => setRevealed(true)}
              >
                {isAr ? 'اكشف الآية' : 'Show verse'}
              </button>
            ) : (
              <div className="hifz__quality-row">
                <p className="hifz__quality-label">{isAr ? 'كيف كانت إجابتك؟' : 'How did you do?'}</p>
                <div className="hifz__quality-btns">
                  {QUALITY_LABELS.map(({ q, label, color }) => (
                    <button
                      key={q}
                      type="button"
                      className="hifz__quality-btn"
                      style={{ '--q-color': color }}
                      onClick={() => handleQuality(q)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
        <Footer />
      </>
    );
  }

  // Overview / dashboard
  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
            { label: isAr ? 'مراجعة الحفظ' : 'Hifz Review' },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">📚 {isAr ? 'التكرار المتباعد' : 'Spaced Repetition'}</span>
            <h1>{isAr ? 'مراجعة الحفظ' : 'Hifz Review'}</h1>
            <p className="hub-hero__sub">
              {isAr
                ? 'راجع محفوظاتك بنظام SM-2 لتثبيتها في الذاكرة طويلة المدى'
                : 'Review your memorisation with the SM-2 algorithm for long-term retention'}
            </p>
          </div>
        </section>

        <section className="container" style={{ maxWidth: 700, paddingBottom: 80 }}>

          {/* Stats row */}
          <div className="hifz__stats-row">
            <div className="hifz__stat-box">
              <strong>{due.length}</strong>
              <span>{isAr ? 'تستحق المراجعة اليوم' : 'Due today'}</span>
            </div>
            <div className="hifz__stat-box">
              <strong>{cards.filter((c) => c.repetitions > 0).length}</strong>
              <span>{isAr ? 'تمت مراجعتها' : 'Reviewed'}</span>
            </div>
            <div className="hifz__stat-box">
              <strong>{cards.length}</strong>
              <span>{isAr ? 'إجمالي البطاقات' : 'Total cards'}</span>
            </div>
          </div>

          {due.length > 0 ? (
            <button
              type="button"
              className="btn btn--green btn--lg btn--block"
              onClick={startSession}
              style={{ marginBottom: 16 }}
            >
              {isAr ? `ابدأ المراجعة (${due.length} آية)` : `Start review session (${due.length} card${due.length !== 1 ? 's' : ''})`}
            </button>
          ) : (
            <div className="hifz__done-card" style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '2rem' }}>✅</div>
              <p>
                {isAr
                  ? 'رائع! لا توجد بطاقات مستحقة الآن. عد لاحقاً.'
                  : "You're all caught up! No cards due right now. Check back later."}
              </p>
            </div>
          )}

          {/* Card list */}
          <div className="hifz__card-list">
            {cards.map((c) => {
              const isDue = new Date(c.nextReview) <= new Date();
              return (
                <div key={c.id} className={`hifz__card-row${isDue ? ' due' : ''}`}>
                  <div>
                    <p className="hifz__card-surah">{c.surah} · {isAr ? 'آية' : 'v.'}{c.verse}</p>
                    <p className="hifz__card-arabic" dir="rtl" lang="ar">{c.arabic.slice(0, 40)}{c.arabic.length > 40 ? '…' : ''}</p>
                  </div>
                  <div className="hifz__card-meta">
                    <span className={`hifz__due-badge${isDue ? ' due' : ''}`}>
                      {isDue ? (isAr ? 'مستحقة' : 'Due') : `+${c.interval}d`}
                    </span>
                    <span className="hifz__ease">{c.easeFactor.toFixed(1)}×</span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn--ghost"
            style={{ marginTop: 24, fontSize: '.85rem' }}
            onClick={resetAll}
          >
            {isAr ? 'إعادة ضبط جميع البطاقات' : 'Reset all cards'}
          </button>
        </section>
      </main>
      <Footer />
    </>
  );
}
