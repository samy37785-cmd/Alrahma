import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/islamic-tools.css';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';
import { TOOLS_TEXT, pick } from '../../i18n/content';
import { QIBLA_TEXT } from '../../i18n/tools/qibla';
import { RELATED_TOOLS_TEXT } from '../../i18n/tools/relatedTools';
import QiblaCompass from '../../components/features/tools/QiblaCompass';
import { qiblaBearing, qiblaDistance, fetchPrayerCity } from '../../utils/islamicToolsUtils';

export default function QiblaPage() {
  const { lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const t = QIBLA_TEXT[lang] || QIBLA_TEXT.en;
  const rt = RELATED_TOOLS_TEXT[lang] || RELATED_TOOLS_TEXT.en;

  useSEO({ title: t.seo.title, description: t.seo.description });

  const [bearing,       setBearing]      = useState(null);
  const [distance,      setDistance]     = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [compassPerm,   setCompassPerm]  = useState(false);
  const [loading,       setLoading]      = useState(true);
  const [cityInput,     setCityInput]    = useState('');
  const [error,         setError]        = useState('');
  const [showSearch,    setShowSearch]   = useState(false);
  const compassHandlerRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        setBearing(qiblaBearing(c.latitude, c.longitude));
        setDistance(qiblaDistance(c.latitude, c.longitude));
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (compassHandlerRef.current) {
        window.removeEventListener('deviceorientation', compassHandlerRef.current);
      }
    };
  }, []);

  const startCompass = useCallback(async () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') return;
    }
    const handler = (e) => setDeviceHeading(e.alpha ?? null);
    if (compassHandlerRef.current) window.removeEventListener('deviceorientation', compassHandlerRef.current);
    compassHandlerRef.current = handler;
    window.addEventListener('deviceorientation', handler);
    setCompassPerm(true);
  }, []);

  const searchCity = async (e) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await fetchPrayerCity(cityInput.trim(), 3, 0);
      const lat = Number(data.meta?.latitude);
      const lng = Number(data.meta?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setBearing(qiblaBearing(lat, lng));
        setDistance(qiblaDistance(lat, lng));
        setShowSearch(false);
      } else {
        setError(tx.errCity);
      }
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
          <div className="it__qibla-page">
            <div className="it__qibla-card">
              <h2 className="it__qibla-title">{tx.qibla.title}</h2>

              {loading && <div className="it__spin"><div className="it__spinner" /></div>}

              {/* Compass shown: bearing found */}
              {!loading && bearing !== null && (
                <>
                  <QiblaCompass bearing={bearing} deviceHeading={deviceHeading} />

                  <div className="it__qibla-info">
                    <div className="it__qibla-stat">
                      <span className="it__qs-val">{Math.round(bearing)}°</span>
                      <span className="it__qs-lbl">{tx.qibla.fromNorth}</span>
                    </div>
                    {distance && (
                      <div className="it__qibla-stat">
                        <span className="it__qs-val">{distance.toLocaleString()} km</span>
                        <span className="it__qs-lbl">{tx.qibla.distance}</span>
                      </div>
                    )}
                  </div>

                  {!compassPerm && (
                    <button className="it__compass-btn" onClick={startCompass}>
                      {tx.qibla.enableCompass}
                    </button>
                  )}
                  {compassPerm && <p className="it__compass-live">{tx.qibla.compassLive}</p>}

                  {/* Change-location toggle */}
                  {!showSearch ? (
                    <button
                      className="it__tab-link"
                      style={{ display: 'block', margin: '1.25rem auto 0', fontSize: '.85rem' }}
                      onClick={() => setShowSearch(true)}
                    >
                      📍 {t.changeLocation}
                    </button>
                  ) : (
                    <form className="it__city-form" onSubmit={searchCity} style={{ marginTop: '1.25rem' }}>
                      <div className="it__city-row">
                        <input id="qibla-city-search" name="city" className="it__city-input" value={cityInput}
                          onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder}
                          aria-label={tx.cityPlaceholder} />
                        <button className="it__city-btn" type="submit">{tx.search}</button>
                      </div>
                      {error && <p className="it__err">{error}</p>}
                    </form>
                  )}
                </>
              )}

              {/* No location: show search prominently */}
              {!loading && bearing === null && (
                <>
                  <form className="it__city-form" onSubmit={searchCity} style={{ marginBottom: '1.25rem' }}>
                    <div className="it__city-row">
                      <input id="qibla-city-search" name="city" className="it__city-input" value={cityInput}
                        onChange={(e) => setCityInput(e.target.value)} placeholder={tx.cityPlaceholder}
                        aria-label={tx.cityPlaceholder} autoFocus />
                      <button className="it__city-btn" type="submit">{tx.search}</button>
                    </div>
                    {error && <p className="it__err">{error}</p>}
                  </form>
                  <div className="it__qibla-no-loc">
                    <p>{tx.qibla.allowFirst}</p>
                    <Link to="/tools/prayer-times" className="it__tab-link">{tx.qibla.goToPrayer}</Link>
                  </div>
                </>
              )}

              <div className="it__kaaba-info">
                <h3>{tx.qibla.kaabaTitle}</h3>
                <p dir={t.dir}>{tx.qibla.kaabaText}</p>
              </div>
            </div>
          </div>

          <nav className="it__also-try" aria-label={rt.ariaLabel}>
            <span className="it__also-try__label">{rt.alsoTry}</span>
            <Link to="/tools/prayer-times">🕌 {rt.prayerTimes}</Link>
            <Link to="/tools/islamic-calendar">📅 {rt.calendar}</Link>
            <Link to="/tools/verse-of-the-day">🌟 {rt.verse}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
