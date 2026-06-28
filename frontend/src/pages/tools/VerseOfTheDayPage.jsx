import { useState, useEffect } from 'react';
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
  const verseKey = DAILY_VERSE_KEYS[(new Date().getDate() - 1) % DAILY_VERSE_KEYS.length];

  useEffect(() => {
    setVerseError(false);
    getVerse(verseKey, 20).then(setVerse).catch(() => setVerseError(true));
  }, [verseKey]);

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
                ? 'آية قرآنية مختارة لكل يوم من أيام الشهر مع ترجمتها بالإنجليزية. ابدأ يومك بكلام الله.'
                : 'A carefully chosen verse for each day of the month with English translation. Begin your day with the words of Allah.'}
            </p>
          </div>
        </section>

        <div className="container it__body">
          <div className="it__verse-page">
            <div className="it__verse-card">
              <div className="it__verse-head">
                <h2>{tx.verse.title}</h2>
                <span className="it__verse-key-badge">{verseKey}</span>
              </div>

              {verse && (
                <>
                  <p className="it__verse-ar" dir="rtl" lang="ar">
                    {verse.text_uthmani}
                    <span className="it__verse-vnum"> ﴿{verse.verse_key?.split(':')[1]}﴾</span>
                  </p>
                  {verse.translations?.[0] && (
                    <p className="it__verse-tr">
                      {verse.translations[0].text?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')}
                    </p>
                  )}
                  <p className="it__verse-ref" dir={isAr ? 'rtl' : 'ltr'}>
                    {tx.verse.ref} {verseKey.split(':')[0]} : {verseKey.split(':')[1]}
                  </p>
                </>
              )}
              {!verse && !verseError && <div className="it__spin"><div className="it__spinner" /></div>}
              {verseError && (
                <p className="it__empty" style={{ padding: '2rem' }}>
                  {isAr ? 'تعذّر تحميل الآية. تحقق من اتصالك بالإنترنت.' : 'Could not load the verse. Check your internet connection.'}
                </p>
              )}
            </div>
          </div>

          <nav className="it__also-try" aria-label={isAr ? 'أدوات مرتبطة' : 'Related tools'}>
            <span className="it__also-try__label">{isAr ? 'استكشف أيضاً:' : 'Also try:'}</span>
            <Link to="/tools/prayer-times">🕌 {isAr ? 'مواقيت الصلاة' : 'Prayer Times'}</Link>
            <Link to="/tools/qibla">🧭 {isAr ? 'اتجاه القبلة' : 'Qibla Direction'}</Link>
            <Link to="/tools/islamic-calendar">📅 {isAr ? 'التقويم الإسلامي' : 'Islamic Calendar'}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
