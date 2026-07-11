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
import {
  PRAYERS_ORDER, PRAYER_META, EXTRA_ORDER, EXTRA_META,
  ASR_SCHOOLS, CALC_METHODS,
  stripParens, fmtTime, fmtClock, parseMins,
  tzNowSecs, tzClock, nextPrayerInfo, formatHMS,
  fetchPrayerCoords, fetchPrayerCity, fetchMonth,
} from '../../utils/islamicToolsUtils';

export default function PrayerTimesPage() {
  const { lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'مواقيت الصلاة' : 'Prayer Times',
    description: isAr
      ? 'مواقيت صلاة دقيقة لموقعك مع عداد تنازلي للصلاة القادمة، ومنبه الصلاة، والجدول الشهري الكامل.'
      : 'Accurate prayer times for your location with live countdown, prayer alerts, and full monthly timetable.',
  });

  const [coords,       setCoords]      = useState(null);
  const [cityInput,    setCityInput]   = useState('');
  const [method,       setMethod]      = useState(3);
  const [school,       setSchool]      = useState(0);
  const [clock12,      setClock12]     = useState(false);
  const [prayerData,   setPrayerData]  = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState('');
  const [locationName, setLocationName] = useState('');
  const [nextPrayer,   setNextPrayer]  = useState(null);
  const [secsLeft,     setSecsLeft]    = useState(0);
  const [clock,        setClock]       = useState('');
  const [notifyMins,   setNotifyMins]  = useState(10);
  const [notifyOn,     setNotifyOn]    = useState(false);
  const [notifyPerms,  setNotifyPerms] = useState('default');
  const timerRef  = useRef(null);
  const notifyRef = useRef([]);

  const [monthData, setMonthData] = useState(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [monthLoad, setMonthLoad] = useState(false);

  const hijri = prayerData?.date?.hijri;
  const greg  = prayerData?.date?.gregorian;

  const apply = useCallback((data, name = '') => {
    setPrayerData(data);
    setNextPrayer(nextPrayerInfo(data.timings));
    setLocationName(name || data.meta?.timezone || '');
    setLoading(false);
    setError('');
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        try {
          setCoords({ lat: c.latitude, lng: c.longitude });
          apply(await fetchPrayerCoords(c.latitude, c.longitude, method, school));
        } catch { setLoading(false); }
      },
      () => setLoading(false),
      { timeout: 8000 }
    );
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!coords && !prayerData) return;
    setLoading(true);
    setMonthData(null);
    const fn = coords
      ? fetchPrayerCoords(coords.lat, coords.lng, method, school)
      : fetchPrayerCity(locationName, method, school);
    fn.then((d) => apply(d, locationName)).catch(() => { setError(tx.errRefetch); setLoading(false); });
  }, [method, school]); // eslint-disable-line

  const searchCity = async (e) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await fetchPrayerCity(cityInput.trim(), method, school);
      setMonthData(null);
      const lat = Number(data.meta?.latitude);
      const lng = Number(data.meta?.longitude);
      apply(data, cityInput.trim());
      setCoords(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
    } catch { setError(tx.errCity); setLoading(false); }
  };

  const toggleMonth = async () => {
    if (monthOpen) { setMonthOpen(false); return; }
    setMonthOpen(true);
    if (monthData || (!coords && !locationName)) return;
    setMonthLoad(true);
    try {
      const now = new Date();
      const loc = coords ? { lat: coords.lat, lng: coords.lng } : { city: locationName };
      setMonthData(await fetchMonth(loc, method, school, now.getMonth() + 1, now.getFullYear()));
    } catch { /* silent */ }
    finally { setMonthLoad(false); }
  };

  useEffect(() => {
    if (!prayerData) return;
    const tz = prayerData.meta?.timezone;
    const tick = () => {
      const nowSecs = tzNowSecs(tz);
      const np = nextPrayerInfo(prayerData.timings, nowSecs);
      setNextPrayer(np);
      setSecsLeft(np.secsLeft);
      setClock(tzClock(tz));
    };
    tick();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [prayerData]);

  useEffect(() => {
    if ('Notification' in window) setNotifyPerms(Notification.permission);
  }, []);

  useEffect(() => {
    notifyRef.current.forEach(clearTimeout);
    notifyRef.current = [];
    if (!notifyOn || !prayerData || notifyPerms !== 'granted') return;
    const tz = prayerData.meta?.timezone;
    const nowSecs = tzNowSecs(tz);
    const nowMins = Math.floor(nowSecs / 60);
    const nowSecsInMin = nowSecs % 60;
    PRAYERS_ORDER.filter((p) => p !== 'Sunrise').forEach((name) => {
      const pm = parseMins(prayerData.timings[name]);
      let minsLeft = pm - nowMins;
      if (minsLeft < 0) minsLeft += 1440;
      const secsUntilAlert = (minsLeft - notifyMins) * 60 - nowSecsInMin;
      if (secsUntilAlert > 0) {
        const id = setTimeout(() => {
          new Notification(`${PRAYER_META[name].icon} ${PRAYER_META[name].ar} — بعد ${notifyMins} دقيقة`, {
            body: `وقت صلاة ${PRAYER_META[name].ar}: ${stripParens(prayerData.timings[name])}`,
            icon: '/favicon.svg',
          });
        }, secsUntilAlert * 1000);
        notifyRef.current.push(id);
      }
    });
  }, [notifyOn, notifyMins, prayerData, notifyPerms]);

  useEffect(() => () => { notifyRef.current.forEach(clearTimeout); }, []);

  const requestNotify = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifyPerms(perm);
    if (perm === 'granted') setNotifyOn(true);
  };

  return (
    <>
      <Header />
      <main id="main-content" className="it__main">
        <Breadcrumbs items={[
          { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
          { label: isAr ? 'أدوات الصلاة' : 'Prayer Tools', to: '/tools/prayer' },
          { label: isAr ? 'مواقيت الصلاة' : 'Prayer Times' },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{isAr ? 'الأدوات الإسلامية' : 'Islamic Tools'}</p>
            <h1>{isAr ? 'مواقيت الصلاة' : 'Prayer Times'}</h1>
            <p className="it__hero-sub">
              {isAr
                ? 'مواقيت دقيقة لموقعك مع عداد تنازلي مباشر للصلاة القادمة، ومنبه الصلاة، والجدول الشهري.'
                : 'Accurate times for your location with a live countdown to the next prayer, alerts, and a monthly timetable.'}
            </p>
            {hijri && (
              <div className="it__hijri">
                <span className="it__hijri-ar" dir={isAr ? 'rtl' : 'ltr'}>
                  {hijri.day} {isAr ? hijri.month.ar : (tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en)} {hijri.year} {isAr ? 'هـ' : 'AH'}
                </span>
                <span className="it__hijri-sep">·</span>
                <span className="it__hijri-en">{greg?.date}</span>
              </div>
            )}
          </div>
        </section>

        <div className="container it__body">
          <div className="it__prayer-page">

            <div className="it__controls">
              <div className="it__control-item">
                <label className="it__ctrl-lbl">{tx.calcMethod}</label>
                <select className="it__ctrl-sel" value={method} onChange={(e) => setMethod(Number(e.target.value))}>
                  {CALC_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{isAr ? m.name : m.en}</option>
                  ))}
                </select>
              </div>

              <div className="it__control-item">
                <label className="it__ctrl-lbl">{tx.asrSchool}</label>
                <select className="it__ctrl-sel" value={school} onChange={(e) => setSchool(Number(e.target.value))}>
                  {ASR_SCHOOLS.map((s, i) => (
                    <option key={s.id} value={s.id}>{tx.asrSchools[i]}</option>
                  ))}
                </select>
              </div>

              <div className="it__control-item">
                <label className="it__ctrl-lbl">{tx.timeFormat}</label>
                <div className="it__fmt-toggle">
                  <button className={`it__fmt-btn${!clock12 ? ' active' : ''}`} onClick={() => setClock12(false)}>24</button>
                  <button className={`it__fmt-btn${clock12 ? ' active' : ''}`} onClick={() => setClock12(true)}>12</button>
                </div>
              </div>

              <div className="it__control-item">
                <label className="it__ctrl-lbl">{tx.notify}</label>
                <div className="it__notify-row">
                  {notifyPerms !== 'granted' ? (
                    <button className="it__notify-btn" onClick={requestNotify}>{tx.enableNotify}</button>
                  ) : (
                    <>
                      <button
                        role="switch"
                        aria-checked={notifyOn}
                        aria-label={isAr ? 'تفعيل منبّه الصلاة' : 'Toggle prayer alerts'}
                        className={`it__toggle${notifyOn ? ' on' : ''}`}
                        onClick={() => setNotifyOn((v) => !v)}
                      >
                        <div className="it__toggle-knob" />
                      </button>
                      {notifyOn && (
                        <select className="it__ctrl-sel it__ctrl-sel--sm" value={notifyMins}
                          onChange={(e) => setNotifyMins(Number(e.target.value))}>
                          {[5,10,15,20,30].map((n) => (
                            <option key={n} value={n}>{tx.before} {n} {tx.minute}</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                </div>
              </div>

              <form className="it__city-form it__control-item" onSubmit={searchCity}>
                <label className="it__ctrl-lbl">{tx.changeCity}</label>
                <div className="it__city-row">
                  <input
                    className="it__city-input"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    placeholder={tx.cityPlaceholder}
                  />
                  <button className="it__city-btn" type="submit">{tx.search}</button>
                </div>
                {error && <p className="it__err">{error}</p>}
              </form>
            </div>

            {nextPrayer && prayerData && (
              <div className="it__next-banner" style={{ '--c': PRAYER_META[nextPrayer.name]?.color }}>
                <div className="it__next-left">
                  <p className="it__next-lbl">{tx.nextPrayerLbl}</p>
                  <p className="it__next-name" dir={isAr ? 'rtl' : 'ltr'}>
                    {PRAYER_META[nextPrayer.name]?.icon} {tx.prayers[nextPrayer.name]}
                  </p>
                  <p className="it__next-time">{fmtTime(prayerData.timings[nextPrayer.name], clock12)}</p>
                </div>
                <div className="it__next-right">
                  {clock && <p className="it__next-clock" dir="ltr">🕐 {fmtClock(clock, clock12)}</p>}
                  <p className="it__next-cd-lbl">{tx.timeRemaining}</p>
                  <p className="it__next-cd">{formatHMS(Math.max(0, secsLeft))}</p>
                  {locationName && <p className="it__next-loc">📍 {locationName}</p>}
                </div>
              </div>
            )}

            {loading && <div className="it__spin"><div className="it__spinner" /></div>}
            {!loading && !prayerData && <div className="it__empty"><p>{tx.noLocation}</p></div>}

            {!loading && prayerData && (
              <ul className="it__prayer-list">
                {PRAYERS_ORDER.map((name) => {
                  const isNext = nextPrayer?.name === name;
                  return (
                    <li key={name} className={`it__prayer-item${isNext ? ' it__prayer-item--next' : ''}${name === 'Sunrise' ? ' it__prayer-item--sunrise' : ''}`}>
                      <span className="it__pi-icon" style={{ color: PRAYER_META[name].color }}>{PRAYER_META[name].icon}</span>
                      <div className="it__pi-names">
                        <span className="it__pi-ar" dir={isAr ? 'rtl' : 'ltr'}>{tx.prayers[name]}</span>
                        <span className="it__pi-en">{isAr ? name : PRAYER_META[name].ar}</span>
                      </div>
                      <span className="it__pi-time">{fmtTime(prayerData.timings[name], clock12)}</span>
                      {isNext && <span className="it__pi-badge">{tx.upcoming}</span>}
                    </li>
                  );
                })}
              </ul>
            )}

            {!loading && prayerData && (
              <div className="it__extra-times">
                {EXTRA_ORDER.map((name) => (
                  <div key={name} className="it__extra-card" style={{ '--c': EXTRA_META[name].color }}>
                    <span className="it__extra-icon">{EXTRA_META[name].icon}</span>
                    <span className="it__extra-ar" dir={isAr ? 'rtl' : 'ltr'}>{tx.extras[name]}</span>
                    <span className="it__extra-time">{fmtTime(prayerData.timings[name], clock12)}</span>
                  </div>
                ))}
              </div>
            )}

            {!loading && prayerData && (
              <div className="it__month">
                <button className="it__month-toggle" onClick={toggleMonth}>
                  {monthOpen ? tx.monthHide : tx.monthShow}
                </button>
                {monthOpen && monthLoad && <div className="it__spin"><div className="it__spinner" /></div>}
                {monthOpen && monthData && (
                  <div className="it__month-wrap">
                    <table className="it__month-table">
                      <thead>
                        <tr>
                          <th>{tx.cols.date}</th><th>{tx.cols.Fajr}</th><th>{tx.cols.Sunrise}</th>
                          <th>{tx.cols.Dhuhr}</th><th>{tx.cols.Asr}</th><th>{tx.cols.Maghrib}</th><th>{tx.cols.Isha}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthData.map((d) => {
                          const isToday = greg?.date && d.date?.gregorian?.date === greg.date;
                          return (
                            <tr key={d.date.gregorian.date} className={isToday ? 'it__month-today' : ''}>
                              <td className="it__month-date">
                                <strong>{d.date.gregorian.day}</strong>
                                <span dir={isAr ? 'rtl' : 'ltr'}>{d.date.hijri.day} {isAr ? d.date.hijri.month.ar : (tx.cal.months[parseInt(d.date.hijri.month.number) - 1] || d.date.hijri.month.en)}</span>
                              </td>
                              <td>{fmtTime(d.timings.Fajr, clock12)}</td>
                              <td>{fmtTime(d.timings.Sunrise, clock12)}</td>
                              <td>{fmtTime(d.timings.Dhuhr, clock12)}</td>
                              <td>{fmtTime(d.timings.Asr, clock12)}</td>
                              <td>{fmtTime(d.timings.Maghrib, clock12)}</td>
                              <td>{fmtTime(d.timings.Isha, clock12)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>

          <nav className="it__also-try" aria-label={isAr ? 'أدوات مرتبطة' : 'Related tools'}>
            <span className="it__also-try__label">{isAr ? 'استكشف أيضاً:' : 'Also try:'}</span>
            <Link to="/tools/qibla">🧭 {isAr ? 'اتجاه القبلة' : 'Qibla Direction'}</Link>
            <Link to="/tools/islamic-calendar">📅 {isAr ? 'التقويم الإسلامي' : 'Islamic Calendar'}</Link>
            <Link to="/tools/verse-of-the-day">🌟 {isAr ? 'آية اليوم' : 'Verse of the Day'}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
