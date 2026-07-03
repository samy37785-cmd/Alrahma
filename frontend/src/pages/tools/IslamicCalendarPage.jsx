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
import {
  daysUntilHijriEvent, fetchPrayerCoords, fetchPrayerCity,
} from '../../utils/islamicToolsUtils';

export default function IslamicCalendarPage() {
  const { lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'التقويم الإسلامي' : 'Islamic Calendar',
    description: isAr
      ? 'التاريخ الهجري لليوم، والعد التنازلي لرمضان وعيد الفطر وعيد الأضحى.'
      : 'Today\'s Hijri date with countdowns to Ramadan, Eid al-Fitr, and Eid al-Adha.',
  });

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
          { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
          { label: isAr ? 'أدوات الصلاة' : 'Prayer Tools', to: '/tools/prayer' },
          { label: isAr ? 'التقويم الإسلامي' : 'Islamic Calendar' },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{isAr ? 'الأدوات الإسلامية' : 'Islamic Tools'}</p>
            <h1>{isAr ? 'التقويم الإسلامي' : 'Islamic Calendar'}</h1>
            <p className="it__hero-sub">
              {isAr
                ? 'التاريخ الهجري لليوم مع العد التنازلي للمناسبات الإسلامية القادمة، ومرجع أشهر السنة الهجرية.'
                : "Today's Hijri date with countdowns to Ramadan, Eid al-Fitr, and Eid al-Adha, plus Hijri month names."}
            </p>
          </div>
        </section>

        <div className="container it__body">
          <div className="it__cal-page">

            {/* No data: show search prominently */}
            {!loading && !hijri && (
              <form className="it__city-form" onSubmit={searchCity} style={{ marginBottom: '1.5rem' }}>
                <div className="it__city-row">
                  <input className="it__city-input" value={cityInput} autoFocus
                    onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder} />
                  <button className="it__city-btn" type="submit">{tx.search}</button>
                </div>
                {error && <p className="it__err">{error}</p>}
              </form>
            )}

            {loading && <div className="it__spin"><div className="it__spinner" /></div>}

            {/* Hijri date display — only when data is available */}
            {hijri && (
              <div className="it__cal-hero">
                <p className="it__cal-hijri-date" dir={isAr ? 'rtl' : 'ltr'}>
                  {isAr ? hijri.weekday.ar : hijri.weekday.en}{' '}
                  {hijri.day}{' '}
                  {isAr ? hijri.month.ar : (tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en)}{' '}
                  {hijri.year} {isAr ? 'هـ' : 'AH'}
                </p>
                <p className="it__cal-greg">{greg?.weekday?.en}, {greg?.date}</p>
                <p className="it__cal-month-name">
                  {tx.cal.monthWord} {isAr ? hijri.month.ar : (tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en)}
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
                  📍 {isAr ? 'تغيير المدينة' : 'Change city'}
                </button>
              </div>
            )}
            {hijri && showSearch && (
              <form className="it__city-form" onSubmit={searchCity} style={{ marginBottom: '1.25rem' }}>
                <div className="it__city-row">
                  <input className="it__city-input" value={cityInput} autoFocus
                    onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder} />
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
                      {isAr
                        ? `1 رمضان ${parseInt(hijri.year) + (daysToRamadan > 300 ? 1 : 0)} هـ`
                        : `1 Ramadan ${parseInt(hijri.year) + (daysToRamadan > 300 ? 1 : 0)} AH`}
                    </span>
                  </div>

                  <div className="it__occasion it__occasion--eid1">
                    <span className="it__oc-icon">🎉</span>
                    <span className="it__oc-name">{tx.cal.eidFitr}</span>
                    <span className="it__oc-days">{daysToEidFitr === 0 ? tx.cal.today : `${daysToEidFitr} ${tx.cal.days}`}</span>
                    <span className="it__oc-lbl">
                      {isAr
                        ? `1 شوال ${parseInt(hijri.year) + (daysToEidFitr > 300 ? 1 : 0)} هـ`
                        : `1 Shawwal ${parseInt(hijri.year) + (daysToEidFitr > 300 ? 1 : 0)} AH`}
                    </span>
                  </div>

                  <div className="it__occasion it__occasion--eid2">
                    <span className="it__oc-icon">🐑</span>
                    <span className="it__oc-name">{tx.cal.eidAdha}</span>
                    <span className="it__oc-days">{daysToEidAdha === 0 ? tx.cal.today : `${daysToEidAdha} ${tx.cal.days}`}</span>
                    <span className="it__oc-lbl">
                      {isAr
                        ? `10 ذو الحجة ${parseInt(hijri.year) + (daysToEidAdha > 300 ? 1 : 0)} هـ`
                        : `10 Dhu al-Hijjah ${parseInt(hijri.year) + (daysToEidAdha > 300 ? 1 : 0)} AH`}
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

          <nav className="it__also-try" aria-label={isAr ? 'أدوات مرتبطة' : 'Related tools'}>
            <span className="it__also-try__label">{isAr ? 'استكشف أيضاً:' : 'Also try:'}</span>
            <Link to="/tools/prayer-times">🕌 {isAr ? 'مواقيت الصلاة' : 'Prayer Times'}</Link>
            <Link to="/tools/qibla">🧭 {isAr ? 'اتجاه القبلة' : 'Qibla Direction'}</Link>
            <Link to="/tools/verse-of-the-day">🌟 {isAr ? 'آية اليوم' : 'Verse of the Day'}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
