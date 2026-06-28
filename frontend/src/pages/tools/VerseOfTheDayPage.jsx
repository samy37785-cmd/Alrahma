import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/islamic-tools.css';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';
import { TOOLS_TEXT, pick } from '../../i18n/content';
import { getVerse } from '../../api/quran';
import { DAILY_VERSE_KEYS } from '../../utils/islamicToolsUtils';
import { site } from '../../data/site';

const clean = (html = '') =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

export default function VerseOfTheDayPage() {
  const { lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'آية اليوم' : 'Verse of the Day',
    description: isAr
      ? 'آية قرآنية يومية مختارة مع ترجمتها — ابدأ يومك بكلام الله.'
      : 'A handpicked Quran verse every day with English translation — start your day with the words of Allah.',
  });

  const [verse,      setVerse]      = useState(null);
  const [verseError, setVerseError] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [shared,     setShared]     = useState(false);
  const cardRef = useRef(null);

  const verseKey = DAILY_VERSE_KEYS[(new Date().getDate() - 1) % DAILY_VERSE_KEYS.length];

  useEffect(() => {
    setVerseError(false);
    getVerse(verseKey, 20).then(setVerse).catch(() => setVerseError(true));
  }, [verseKey]);

  const arabic = verse?.text_uthmani || '';
  const trans  = verse?.translations?.[0] ? clean(verse.translations[0].text) : '';
  const [s, v] = verseKey.split(':');

  const handleCopy = async () => {
    const text = `${arabic}\n\n"${trans}"\n— Quran ${verseKey}\n\nalrahma.academy`;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    const url  = `${window.location.origin}/tools/quran-reader#s=${s}&v=${v}`;
    const text = `Today's Verse (${verseKey})\n\n${arabic}\n\n"${trans}"\n\nLearn Quran at alrahma.academy`;
    if (navigator.share) {
      try { await navigator.share({ title: `Quran ${verseKey}`, text, url }); setShared(true); setTimeout(() => setShared(false), 2500); }
      catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(`🌿 Today's Verse (${verseKey})\n\n${arabic}\n\n"${trans}"\n\n📖 Learn Quran online: ${window.location.origin}`)}`;

  return (
    <>
      <Header />
      <main id="main-content" className="it__main">
        <Breadcrumbs items={[
          { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
          { label: isAr ? 'أدوات الصلاة' : 'Prayer Tools', to: '/tools/prayer' },
          { label: isAr ? 'آية اليوم' : 'Verse of the Day' },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{isAr ? 'الأدوات الإسلامية' : 'Islamic Tools'}</p>
            <h1>{isAr ? 'آية اليوم' : 'Verse of the Day'}</h1>
            <p className="it__hero-sub">
              {isAr
                ? 'آية قرآنية مختارة لكل يوم من أيام الشهر مع ترجمتها. ابدأ يومك بكلام الله.'
                : 'A carefully chosen verse for each day of the month with translation. Begin your day with the words of Allah.'}
            </p>
          </div>
        </section>

        <div className="container it__body">
          <div className="it__verse-page">

            {/* ── Shareable verse card ── */}
            <div className="votd-card" ref={cardRef}>
              <p className="votd-card__brand">Al-Rahma Academy · {isAr ? 'آية اليوم' : 'Verse of the Day'}</p>

              <div className="votd-card__divider" aria-hidden="true">
                <span className="votd-card__diamond">◆</span>
              </div>

              {verse ? (
                <>
                  <p className="votd-card__arabic" dir="rtl" lang="ar">
                    {arabic}
                    <span className="votd-card__vnum"> ﴿{v}﴾</span>
                  </p>
                  {trans && (
                    <p className="votd-card__trans">
                      <span className="votd-card__quote">"</span>
                      {trans}
                      <span className="votd-card__quote">"</span>
                    </p>
                  )}
                  <p className="votd-card__ref">Quran · {verseKey}</p>
                </>
              ) : !verseError ? (
                <div className="it__spin"><div className="it__spinner" /></div>
              ) : (
                <p className="it__empty" style={{ padding: '2rem' }}>
                  {isAr ? 'تعذّر تحميل الآية.' : 'Could not load the verse. Check your connection.'}
                </p>
              )}
            </div>

            {/* ── Share actions ── */}
            {verse && (
              <div className="votd-actions">
                <button
                  className={`votd-btn votd-btn--copy${copied ? ' done' : ''}`}
                  onClick={handleCopy}
                  aria-label={isAr ? 'نسخ' : 'Copy text'}
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>

                <button
                  className={`votd-btn votd-btn--share${shared ? ' done' : ''}`}
                  onClick={handleShare}
                  aria-label={isAr ? 'مشاركة' : 'Share'}
                >
                  {shared ? '✓ Shared!' : '🔗 Share'}
                </button>

                <a
                  className="votd-btn votd-btn--wa"
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isAr ? 'شارك على واتساب' : 'Share on WhatsApp'}
                >
                  💬 WhatsApp
                </a>

                <Link
                  className="votd-btn votd-btn--quran"
                  to={`/tools/quran-reader#s=${s}&v=${v}`}
                  aria-label={isAr ? 'اقرأ السياق' : 'Read in context'}
                >
                  📖 {isAr ? 'اقرأ الآية' : 'Read full chapter'}
                </Link>
              </div>
            )}

            {/* ── Screenshot tip ── */}
            {verse && (
              <p className="votd-hint">
                {isAr
                  ? '📸 التقط صورة للبطاقة أعلاه وشاركها على وسائل التواصل الاجتماعي'
                  : '📸 Screenshot the card above to share it on Instagram or WhatsApp Stories'}
              </p>
            )}

            {/* ── Enrollment CTA ── */}
            <div className="votd-enroll-cta">
              <p className="votd-enroll-cta__text">
                {isAr
                  ? 'هل تريد تعلّم هذه الآيات مع معلم معتمد من الأزهر؟'
                  : 'Want to learn to recite verses like this with a certified Al-Azhar tutor?'}
              </p>
              <Link to="/enroll" className="btn btn--gold">
                {isAr ? 'ابدأ درساً مجانياً' : 'Book a Free Trial Lesson →'}
              </Link>
              <span className="votd-enroll-cta__note">
                {isAr ? 'بدون بطاقة ائتمان · الغاء في أي وقت' : 'No credit card · Cancel anytime'}
              </span>
            </div>
          </div>

          <nav className="it__also-try" aria-label={isAr ? 'أدوات مرتبطة' : 'Related tools'}>
            <span className="it__also-try__label">{isAr ? 'استكشف أيضاً:' : 'Also try:'}</span>
            <Link to="/tools/prayer-times">🕌 {isAr ? 'مواقيت الصلاة' : 'Prayer Times'}</Link>
            <Link to="/tools/qibla">🧭 {isAr ? 'اتجاه القبلة' : 'Qibla Direction'}</Link>
            <Link to="/tools/islamic-calendar">📅 {isAr ? 'التقويم الإسلامي' : 'Islamic Calendar'}</Link>
            <Link to="/tools/adhkar">📿 {isAr ? 'الأذكار' : 'Daily Adhkar'}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
