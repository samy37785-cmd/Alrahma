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
import { ISLAMIC_CALENDAR_TEXT } from '../../i18n/tools/islamicCalendar';
import { RELATED_TOOLS_TEXT } from '../../i18n/tools/relatedTools';
import {
  daysUntilHijriEvent, fetchPrayerCoords, fetchPrayerCity,
} from '../../utils/islamicToolsUtils';

// hijri.weekday only carries an ar+en pair from the Aladhan API response
// (structural, not a content module) -- this helper picks between them
// without an isAr/lang==='ar' ternary.
function hijriWeekday(langCode, hijri) {
  if (langCode === 'ar') return hijri.weekday.ar;
  return hijri.weekday.en;
}

export default function IslamicCalendarPage() {
  const { lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const t = ISLAMIC_CALENDAR_TEXT[lang] || ISLAMIC_CALENDAR_TEXT.en;
  const rt = RELATED_TOOLS_TEXT[lang] || RELATED_TOOLS_TEXT.en;

  useSEO({ title: t.seo.title, description: t.seo.description });

  const [prayerData,  setPrayerData]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [cityInput,   setCityInput]   = useState('');
  const [error,       setError]       = useState('');
  const [showSearch,  setShowSearch]  = useState(false);

  const hijri = prayerData?.date?.hijri;
  const greg  = prayerData?.date?.gregorian;
  const daysToRamadan = hijri ? daysUntilHijriEvent(hijri, 9, 1)   : null;
  const daysToEidFitr = hijri ? daysUntilHijriEvent(hijri, 10, 1)  : null;
  const daysToEidAdha = hijri ? daysUntilHijriEvent(hijri, 12, 10) : null;

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        try { setPrayerData(await fetchPrayerCoords(c.latitude, c.longitude, 3, 0)); }
        catch { /* fall through */ }
        finally { setLoading(false); }
      },
      () => setLoading(false),
      { timeout: 8000 }
    );
  }, []);

  const searchCity = async (e) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true); setError('');
    try {
      setPrayerData(await fetchPrayerCity(cityInput.trim(), 3, 0));
      setShowSearch(false);
    } catch { setError(tx.errCity); }
    finally { setLoading(false); }
  };

  return (
    <>
      <Header />
      <main id="main-content" className="it__main">
        <Breadcrumbs items={[
          { label: t.breadcrumbs.tools, to: '/tools' },
          { label: t.breadcrumbs.prayerTools, to: '/tools/prayer' },
          { label: t.breadcrumbs.current },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{tx.eyebrow}</p>
            <h1>{t.hero.title}</h1>
            <p className="it__hero-sub">{t.hero.sub}</p>
          </div>
        </section>

        <div className="container it__body">
          <div className="it__cal-page">

            {/* No data: show search prominently */}
            {!loading && !hijri && (
              <form className="it__city-form" onSubmit={searchCity} style={{ marginBottom: '1.5rem' }}>
                <div className="it__city-row">
                  <input id="cal-city-search" name="city" className="it__city-input" value={cityInput} autoFocus
                    onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder}
                    aria-label={tx.cityPlaceholder} />
                  <button className="it__city-btn" type="submit">{tx.search}</button>
                </div>
                {error && <p className="it__err">{error}</p>}
              </form>
            )}

            {loading && <div className="it__spin"><div className="it__spinner" /></div>}

            {/* Hijri date display — only when data is available */}
            {hijri && (
              <div className="it__cal-hero">
                <p className="it__cal-hijri-date" dir={t.dir}>
                  {hijriWeekday(lang, hijri)}{' '}
                  {hijri.day}{' '}
                  {tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en}{' '}
                  {hijri.year} {t.hijriEra}
                </p>
                <p className="it__cal-greg">{greg?.weekday?.en}, {greg?.date}</p>
                <p className="it__cal-month-name">
                  {tx.cal.monthWord} {tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en}
                </p>
              </div>
            )}

            {/* Data loaded: compact change-location */}
            {hijri && !showSearch && (
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <button
                  className="it__tab-link"
                  style={{ fontSize: '.82rem' }}
                  onClick={() => setShowSearch(true)}
                >
                  📍 {t.changeCity}
                </button>
              </div>
            )}
            {hijri && showSearch && (
              <form className="it__city-form" onSubmit={searchCity} style={{ marginBottom: '1.25rem' }}>
                <div className="it__city-row">
                  <input id="cal-city-search" name="city" className="it__city-input" value={cityInput} autoFocus
                    onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder}
                    aria-label={tx.cityPlaceholder} />
                  <button className="it__city-btn" type="submit">{tx.search}</button>
                </div>
                {error && <p className="it__err">{error}</p>}
              </form>
            )}

            {hijri && (
              <div className="it__occasions">
                <h2>{tx.cal.upcoming}</h2>
                <div className="it__occasions-grid">

                  <div className="it__occasion it__occasion--ramadan">
                    <span className="it__oc-icon">🌙</span>
                    <span className="it__oc-name">{tx.cal.ramadan}</span>
                    <span className="it__oc-days">{daysToRamadan === 0 ? tx.cal.today : `${daysToRamadan} ${tx.cal.days}`}</span>
                    <span className="it__oc-lbl">
                      {`1 ${tx.cal.months[8]} ${parseInt(hijri.year) + (daysToRamadan > 300 ? 1 : 0)} ${t.hijriEra}`}
                    </span>
                  </div>

                  <div className="it__occasion it__occasion--eid1">
                    <span className="it__oc-icon">🎉</span>
                    <span className="it__oc-name">{tx.cal.eidFitr}</span>
                    <span className="it__oc-days">{daysToEidFitr === 0 ? tx.cal.today : `${daysToEidFitr} ${tx.cal.days}`}</span>
                    <span className="it__oc-lbl">
                      {`1 ${tx.cal.months[9]} ${parseInt(hijri.year) + (daysToEidFitr > 300 ? 1 : 0)} ${t.hijriEra}`}
                    </span>
                  </div>

                  <div className="it__occasion it__occasion--eid2">
                    <span className="it__oc-icon">🐑</span>
                    <span className="it__oc-name">{tx.cal.eidAdha}</span>
                    <span className="it__oc-days">{daysToEidAdha === 0 ? tx.cal.today : `${daysToEidAdha} ${tx.cal.days}`}</span>
                    <span className="it__oc-lbl">
                      {`10 ${tx.cal.months[11]} ${parseInt(hijri.year) + (daysToEidAdha > 300 ? 1 : 0)} ${t.hijriEra}`}
                    </span>
                  </div>

                </div>

                <div className="it__months-ref">
                  <h3>{tx.cal.monthsTitle}</h3>
                  <div className="it__months-grid">
                    {tx.cal.months.map((m, i) => (
                      <div key={i} className={`it__month-chip${parseInt(hijri.month.number) === i + 1 ? ' current' : ''}`}>
                        <span className="it__month-num">{i + 1}</span>
                        <span>{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <nav className="it__also-try" aria-label={rt.ariaLabel}>
            <span className="it__also-try__label">{rt.alsoTry}</span>
            <Link to="/tools/prayer-times">🕌 {rt.prayerTimes}</Link>
            <Link to="/tools/qibla">🧭 {rt.qibla}</Link>
            <Link to="/tools/verse-of-the-day">🌟 {rt.verse}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
