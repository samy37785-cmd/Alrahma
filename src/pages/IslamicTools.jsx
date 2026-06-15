import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import useSEO from '../hooks/useSEO';
import { getVerse } from '../api/quran';

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════ */
const MECCA = { lat: 21.3891, lng: 39.8579 };

const PRAYERS_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_META = {
  Fajr:    { ar: 'الفجر',   icon: '🌙', color: '#1a3a5c' },
  Sunrise: { ar: 'الشروق',  icon: '🌅', color: '#e07820' },
  Dhuhr:   { ar: 'الظهر',   icon: '☀️', color: '#d4af37' },
  Asr:     { ar: 'العصر',   icon: '🌤', color: '#0b6e4f' },
  Maghrib: { ar: 'المغرب',  icon: '🌇', color: '#7a3a8a' },
  Isha:    { ar: 'العشاء',  icon: '⭐', color: '#1a5fa0' },
};

const CALC_METHODS = [
  { id: 3,  name: 'الهيئة المصرية العامة للمساحة',         en: 'Egyptian Authority' },
  { id: 4,  name: 'أم القرى (مكة المكرمة)',                en: 'Umm Al-Qura, Makkah' },
  { id: 1,  name: 'رابطة العالم الإسلامي',                 en: 'Muslim World League' },
  { id: 2,  name: 'جمعية إسلامية لأمريكا الشمالية (ISNA)', en: 'ISNA' },
  { id: 5,  name: 'جامعة العلوم الإسلامية، كراتشي',        en: 'Karachi' },
  { id: 12, name: 'الاتحاد الإسلامي الأوروبي',             en: 'Union of Islamic Orgs. (France)' },
];

const HIJRI_MONTHS = [
  'محرم','صفر','ربيع الأول','ربيع الآخر',
  'جمادى الأولى','جمادى الآخرة','رجب','شعبان',
  'رمضان','شوال','ذو القعدة','ذو الحجة',
];

const DAILY_VERSE_KEYS = [
  '2:255','2:286','1:1','3:173','13:28','17:9','18:10','20:114',
  '33:56','39:53','49:13','55:13','65:3','94:5','103:1','112:1',
  '2:152','9:51','57:3','3:200',
];

/* ══════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════ */
function stripParens(t = '') { return t.replace(/\s*\([^)]*\)/g, '').trim(); }
function parseMins(t)        { const [h, m] = stripParens(t).split(':').map(Number); return h * 60 + m; }

function nextPrayerInfo(timings) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const relevant = PRAYERS_ORDER.filter((p) => p !== 'Sunrise');
  for (const name of relevant) {
    const pm = parseMins(timings[name]);
    if (pm > nowMins) return { name, minsLeft: pm - nowMins };
  }
  const pm = parseMins(timings.Fajr);
  return { name: 'Fajr', minsLeft: 1440 - nowMins + pm };
}

function formatHMS(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function qiblaBearing(userLat, userLng) {
  const lat1 = userLat * Math.PI / 180;
  const lat2 = MECCA.lat * Math.PI / 180;
  const dLon  = (MECCA.lng - userLng) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function qiblaDistance(userLat, userLng) {
  const R = 6371;
  const dLat = (MECCA.lat - userLat) * Math.PI / 180;
  const dLon  = (MECCA.lng - userLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(userLat*Math.PI/180)*Math.cos(MECCA.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function daysUntilHijriEvent(hijri, targetMonth, targetDay) {
  const cm = parseInt(hijri.month.number);
  const cd = parseInt(hijri.day);
  if (cm === targetMonth && targetDay > cd) return targetDay - cd;
  let days = 30 - cd;
  let m = cm + 1 > 12 ? 1 : cm + 1;
  while (m !== targetMonth) {
    days += 29.5;
    m = m + 1 > 12 ? 1 : m + 1;
  }
  days += targetDay;
  return Math.round(days);
}

async function fetchPrayerCoords(lat, lng, method) {
  const ts = Math.floor(Date.now() / 1000);
  const r = await fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=${method}`);
  if (!r.ok) throw new Error('API');
  return (await r.json()).data;
}

async function fetchPrayerCity(city, method) {
  const r = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&method=${method}`);
  if (!r.ok) throw new Error('city');
  const j = await r.json();
  if (j.code !== 200) throw new Error('city');
  return j.data;
}

/* ══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════════════ */

/* ── Qibla Compass ──────────────────────────────────────────────── */
function QiblaCompass({ bearing, deviceHeading }) {
  const needleAngle = deviceHeading !== null ? bearing - deviceHeading : bearing;
  const ringAngle   = deviceHeading !== null ? -deviceHeading : 0;

  return (
    <div className="it__compass-wrap">
      <div className="it__compass" style={{ transform: `rotate(${ringAngle}deg)` }}>
        {/* Cardinal directions */}
        {[['N','0'],['E','90'],['S','180'],['W','270']].map(([lbl, deg]) => (
          <span key={lbl} className="it__compass-card" style={{ transform: `rotate(${deg}deg) translateY(-80px) rotate(-${deg}deg)` }}>
            {lbl}
          </span>
        ))}
        {/* Degree marks */}
        {Array.from({ length: 36 }, (_, i) => (
          <div key={i} className="it__compass-tick"
            style={{ transform: `rotate(${i * 10}deg) translateY(-90px)`, height: i % 3 === 0 ? '12px' : '6px' }} />
        ))}
        {/* Qibla needle */}
        <div className="it__compass-needle" style={{ transform: `rotate(${needleAngle}deg)` }}>
          <div className="it__compass-needle-up" />
          <div className="it__compass-needle-dn" />
        </div>
        {/* Center */}
        <div className="it__compass-center">🕋</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function IslamicTools() {
  useSEO({
    title: 'الأدوات الإسلامية — Al-Rahma Academy',
    description: 'مواقيت الصلاة، القبلة، التقويم الهجري، حديث اليوم، آية اليوم.',
  });

  const [tab, setTab] = useState('prayer');

  /* ── Location & Prayer ──────────────────────────────────────── */
  const [coords,       setCoords]       = useState(null);
  const [cityInput,    setCityInput]     = useState('');
  const [method,       setMethod]        = useState(3);
  const [prayerData,   setPrayerData]    = useState(null);
  const [loading,      setLoading]       = useState(true);
  const [error,        setError]         = useState('');
  const [locationName, setLocationName]  = useState('');
  const [nextPrayer,   setNextPrayer]    = useState(null);
  const [secsLeft,     setSecsLeft]      = useState(0);
  const [notifyMins,   setNotifyMins]    = useState(10);
  const [notifyOn,     setNotifyOn]      = useState(false);
  const [notifyPerms,  setNotifyPerms]   = useState('default');
  const timerRef = useRef(null);
  const notifyRef = useRef([]);

  /* ── Qibla ──────────────────────────────────────────────────── */
  const [bearing,       setBearing]      = useState(null);
  const [distance,      setDistance]     = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [compassPerm,   setCompassPerm]  = useState(false);

  /* ── Calendar ───────────────────────────────────────────────── */
  const hijri = prayerData?.date?.hijri;
  const greg  = prayerData?.date?.gregorian;
  const daysToRamadan   = hijri ? daysUntilHijriEvent(hijri, 9, 1)   : null;
  const daysToEidFitr   = hijri ? daysUntilHijriEvent(hijri, 10, 1)  : null;
  const daysToEidAdha   = hijri ? daysUntilHijriEvent(hijri, 12, 10) : null;

  /* ── Verse of the Day ───────────────────────────────────────── */
  const [verse, setVerse] = useState(null);
  const dayIdx   = new Date().getDate() - 1;
  const verseKey = DAILY_VERSE_KEYS[dayIdx % DAILY_VERSE_KEYS.length];

  useEffect(() => {
    getVerse(verseKey, 20).then(setVerse).catch(() => {});
  }, [verseKey]);

  /* ── Apply prayer data ──────────────────────────────────────── */
  const apply = useCallback((data, name = '') => {
    setPrayerData(data);
    const np = nextPrayerInfo(data.timings);
    setNextPrayer(np);
    setLocationName(name || data.meta?.timezone || '');
    setLoading(false);
    setError('');
  }, []);

  /* ── Geolocation ────────────────────────────────────────────── */
  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        try {
          setCoords({ lat: c.latitude, lng: c.longitude });
          const data = await fetchPrayerCoords(c.latitude, c.longitude, method);
          apply(data);
          setBearing(qiblaBearing(c.latitude, c.longitude));
          setDistance(qiblaDistance(c.latitude, c.longitude));
        } catch { setLoading(false); }
      },
      () => setLoading(false),
      { timeout: 8000 }
    );
  }, []); // eslint-disable-line

  /* ── Re-fetch when method changes ──────────────────────────── */
  useEffect(() => {
    if (!coords && !prayerData) return;
    setLoading(true);
    const fn = coords
      ? fetchPrayerCoords(coords.lat, coords.lng, method)
      : fetchPrayerCity(locationName, method);
    fn.then(apply).catch(() => { setError('تعذر إعادة الجلب.'); setLoading(false); });
  }, [method]); // eslint-disable-line

  /* ── City search ────────────────────────────────────────────── */
  const searchCity = async (e) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await fetchPrayerCity(cityInput.trim(), method);
      apply(data, cityInput.trim());
      setCoords(null);
      setBearing(null); setDistance(null);
    } catch { setError('المدينة غير موجودة. استخدم الاسم بالإنجليزية.'); setLoading(false); }
  };

  /* ── Countdown every second ─────────────────────────────────── */
  useEffect(() => {
    if (!prayerData) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const np = nextPrayerInfo(prayerData.timings);
      setNextPrayer(np);
      setSecsLeft(np.minsLeft * 60 - new Date().getSeconds());
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [prayerData]);

  /* ── Notification permission check ─────────────────────────── */
  useEffect(() => {
    if ('Notification' in window) setNotifyPerms(Notification.permission);
  }, []);

  /* ── Schedule notifications ─────────────────────────────────── */
  useEffect(() => {
    notifyRef.current.forEach(clearTimeout);
    notifyRef.current = [];
    if (!notifyOn || !prayerData || notifyPerms !== 'granted') return;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    PRAYERS_ORDER.filter((p) => p !== 'Sunrise').forEach((name) => {
      const pm = parseMins(prayerData.timings[name]);
      let minsLeft = pm - nowMins;
      if (minsLeft < 0) minsLeft += 1440;
      const secsUntilAlert = (minsLeft - notifyMins) * 60 - now.getSeconds();
      if (secsUntilAlert > 0) {
        const id = setTimeout(() => {
          new Notification(`${PRAYER_META[name].icon} ${PRAYER_META[name].ar} — بعد ${notifyMins} دقيقة`, {
            body: `وقت صلاة ${PRAYER_META[name].ar}: ${stripParens(prayerData.timings[name])}`,
            icon: '/favicon.ico',
          });
        }, secsUntilAlert * 1000);
        notifyRef.current.push(id);
      }
    });
  }, [notifyOn, notifyMins, prayerData, notifyPerms]);

  const requestNotify = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifyPerms(perm);
    if (perm === 'granted') setNotifyOn(true);
  };

  /* ── Device orientation for Qibla ──────────────────────────── */
  const startCompass = useCallback(async () => {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') return;
    }
    const handler = (e) => setDeviceHeading(e.alpha ?? null);
    window.addEventListener('deviceorientation', handler);
    setCompassPerm(true);
    return () => window.removeEventListener('deviceorientation', handler);
  }, []);

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <>
      <Header />
      <main className="it__main">

        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">أدوات إسلامية</p>
            <h1>Islamic Daily Tools</h1>
            {hijri && (
              <div className="it__hijri">
                <span className="it__hijri-ar" dir="rtl">
                  {hijri.day} {hijri.month.ar} {hijri.year} هـ
                </span>
                <span className="it__hijri-sep">·</span>
                <span className="it__hijri-en">{greg?.date}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <div className="it__tabs-bar">
          <div className="container it__tabs">
            {[
              { key: 'prayer',   icon: '🕌', ar: 'مواقيت الصلاة' },
              { key: 'qibla',    icon: '🧭', ar: 'القبلة' },
              { key: 'calendar', icon: '📅', ar: 'التقويم الإسلامي' },
              { key: 'verse',    icon: '🌟', ar: 'آية اليوم' },
            ].map((t) => (
              <button
                key={t.key}
                className={`it__tab${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span>{t.icon}</span> {t.ar}
              </button>
            ))}
          </div>
        </div>

        <div className="container it__body">

          {/* ══════════════════════════════════════════════════
              PRAYER TIMES TAB
              ══════════════════════════════════════════════════ */}
          {tab === 'prayer' && (
            <div className="it__prayer-page">

              {/* Controls bar */}
              <div className="it__controls">
                <div className="it__control-item">
                  <label className="it__ctrl-lbl">⚙ طريقة الحساب</label>
                  <select className="it__ctrl-sel" value={method} onChange={(e) => setMethod(Number(e.target.value))}>
                    {CALC_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="it__control-item">
                  <label className="it__ctrl-lbl">🔔 تنبيه الصلاة</label>
                  <div className="it__notify-row">
                    {notifyPerms !== 'granted' ? (
                      <button className="it__notify-btn" onClick={requestNotify}>
                        تفعيل التنبيهات
                      </button>
                    ) : (
                      <>
                        <div
                          className={`it__toggle${notifyOn ? ' on' : ''}`}
                          onClick={() => setNotifyOn((v) => !v)}
                        >
                          <div className="it__toggle-knob" />
                        </div>
                        {notifyOn && (
                          <select className="it__ctrl-sel it__ctrl-sel--sm" value={notifyMins}
                            onChange={(e) => setNotifyMins(Number(e.target.value))}>
                            {[5,10,15,20,30].map((n) => (
                              <option key={n} value={n}>قبل {n} دقيقة</option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <form className="it__city-form it__control-item" onSubmit={searchCity}>
                  <label className="it__ctrl-lbl">📍 تغيير المدينة</label>
                  <div className="it__city-row">
                    <input
                      className="it__city-input"
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      placeholder="e.g. Cairo, London, Paris…"
                    />
                    <button className="it__city-btn" type="submit">بحث</button>
                  </div>
                  {error && <p className="it__err">{error}</p>}
                </form>
              </div>

              {/* Next prayer banner */}
              {nextPrayer && prayerData && (
                <div className="it__next-banner" style={{ '--c': PRAYER_META[nextPrayer.name]?.color }}>
                  <div className="it__next-left">
                    <p className="it__next-lbl">الصلاة القادمة</p>
                    <p className="it__next-name" dir="rtl">
                      {PRAYER_META[nextPrayer.name]?.icon} {PRAYER_META[nextPrayer.name]?.ar}
                    </p>
                    <p className="it__next-time">{stripParens(prayerData.timings[nextPrayer.name])}</p>
                  </div>
                  <div className="it__next-right">
                    <p className="it__next-cd-lbl">الوقت المتبقي</p>
                    <p className="it__next-cd">{formatHMS(Math.max(0, secsLeft))}</p>
                    {locationName && <p className="it__next-loc">📍 {locationName}</p>}
                  </div>
                </div>
              )}

              {loading && <div className="it__spin"><div className="it__spinner" /></div>}

              {!loading && !prayerData && (
                <div className="it__empty">
                  <p>🔒 لم يُسمح بالموقع. ابحث عن مدينتك أعلاه.</p>
                </div>
              )}

              {/* Prayer list */}
              {!loading && prayerData && (
                <ul className="it__prayer-list">
                  {PRAYERS_ORDER.map((name) => {
                    const isNext = nextPrayer?.name === name;
                    const isSunrise = name === 'Sunrise';
                    return (
                      <li key={name} className={`it__prayer-item${isNext ? ' it__prayer-item--next' : ''}${isSunrise ? ' it__prayer-item--sunrise' : ''}`}>
                        <span className="it__pi-icon" style={{ color: PRAYER_META[name].color }}>
                          {PRAYER_META[name].icon}
                        </span>
                        <div className="it__pi-names">
                          <span className="it__pi-ar" dir="rtl">{PRAYER_META[name].ar}</span>
                          <span className="it__pi-en">{name}</span>
                        </div>
                        <span className="it__pi-time">{stripParens(prayerData.timings[name])}</span>
                        {isNext && <span className="it__pi-badge">قادمة ⟵</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              QIBLA TAB
              ══════════════════════════════════════════════════ */}
          {tab === 'qibla' && (
            <div className="it__qibla-page">
              <div className="it__qibla-card">
                <h2 className="it__qibla-title">🕋 اتجاه القبلة</h2>

                {bearing !== null ? (
                  <>
                    <QiblaCompass bearing={bearing} deviceHeading={deviceHeading} />

                    <div className="it__qibla-info">
                      <div className="it__qibla-stat">
                        <span className="it__qs-val">{Math.round(bearing)}°</span>
                        <span className="it__qs-lbl">الاتجاه من الشمال</span>
                      </div>
                      {distance && (
                        <div className="it__qibla-stat">
                          <span className="it__qs-val">{distance.toLocaleString()} km</span>
                          <span className="it__qs-lbl">المسافة إلى مكة</span>
                        </div>
                      )}
                    </div>

                    {!compassPerm && (
                      <button className="it__compass-btn" onClick={startCompass}>
                        🧭 تفعيل البوصلة الحية (للهاتف)
                      </button>
                    )}
                    {compassPerm && (
                      <p className="it__compass-live">✅ البوصلة الحية مفعّلة — وجّه هاتفك ↑</p>
                    )}
                  </>
                ) : (
                  <div className="it__qibla-no-loc">
                    <p>📍 يجب السماح بالموقع من تبويب "مواقيت الصلاة" أولاً</p>
                    <button className="it__tab-link" onClick={() => setTab('prayer')}>
                      الذهاب لمواقيت الصلاة ←
                    </button>
                  </div>
                )}

                {/* Kaaba info */}
                <div className="it__kaaba-info">
                  <h3>🕌 الكعبة المشرفة</h3>
                  <p dir="rtl">
                    الكعبة المشرفة هي أول بيت وُضع للناس، تقع في مدينة مكة المكرمة بالمملكة العربية السعودية.
                    إليها يتوجه المسلمون في جميع أنحاء العالم أثناء الصلاة.
                    إحداثياتها: {MECCA.lat}° شمالاً، {MECCA.lng}° شرقاً.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              CALENDAR TAB
              ══════════════════════════════════════════════════ */}
          {tab === 'calendar' && (
            <div className="it__cal-page">

              {/* Hijri date display */}
              <div className="it__cal-hero">
                {hijri ? (
                  <>
                    <p className="it__cal-hijri-date" dir="rtl">
                      {hijri.weekday.ar} {hijri.day} {hijri.month.ar} {hijri.year} هـ
                    </p>
                    <p className="it__cal-greg">{greg?.weekday?.en}, {greg?.date}</p>
                    <p className="it__cal-month-name">شهر {hijri.month.ar}</p>
                  </>
                ) : (
                  <p className="it__cal-no-data">
                    ابحث عن مدينتك في تبويب "مواقيت الصلاة" لتحديد التاريخ الهجري
                  </p>
                )}
              </div>

              {/* Islamic occasions countdowns */}
              {hijri && (
                <div className="it__occasions">
                  <h2>المناسبات الإسلامية القادمة</h2>
                  <div className="it__occasions-grid">

                    <div className="it__occasion it__occasion--ramadan">
                      <span className="it__oc-icon">🌙</span>
                      <span className="it__oc-name">شهر رمضان المبارك</span>
                      <span className="it__oc-days">{daysToRamadan} يوماً</span>
                      <span className="it__oc-lbl">1 رمضان {parseInt(hijri.year) + (daysToRamadan > 300 ? 1 : 0)} هـ</span>
                    </div>

                    <div className="it__occasion it__occasion--eid1">
                      <span className="it__oc-icon">🎉</span>
                      <span className="it__oc-name">عيد الفطر المبارك</span>
                      <span className="it__oc-days">{daysToEidFitr} يوماً</span>
                      <span className="it__oc-lbl">1 شوال {parseInt(hijri.year) + (daysToEidFitr > 300 ? 1 : 0)} هـ</span>
                    </div>

                    <div className="it__occasion it__occasion--eid2">
                      <span className="it__oc-icon">🐑</span>
                      <span className="it__oc-name">عيد الأضحى المبارك</span>
                      <span className="it__oc-days">{daysToEidAdha} يوماً</span>
                      <span className="it__oc-lbl">10 ذو الحجة {parseInt(hijri.year) + (daysToEidAdha > 300 ? 1 : 0)} هـ</span>
                    </div>

                  </div>

                  {/* Islamic month names reference */}
                  <div className="it__months-ref">
                    <h3>الأشهر الهجرية</h3>
                    <div className="it__months-grid">
                      {HIJRI_MONTHS.map((m, i) => (
                        <div
                          key={i}
                          className={`it__month-chip${parseInt(hijri.month.number) === i + 1 ? ' current' : ''}`}
                        >
                          <span className="it__month-num">{i + 1}</span>
                          <span>{m}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              VERSE OF THE DAY TAB
              ══════════════════════════════════════════════════ */}
          {tab === 'verse' && (
            <div className="it__verse-page">
              <div className="it__verse-card">
                <div className="it__verse-head">
                  <h2>🌟 آية اليوم</h2>
                  <span className="it__verse-key-badge">{verseKey}</span>
                </div>
                {verse ? (
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
                    <p className="it__verse-ref" dir="rtl">سورة {verseKey.split(':')[0]}, الآية {verseKey.split(':')[1]}</p>
                  </>
                ) : (
                  <div className="it__spin"><div className="it__spinner" /></div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
      <Footer />
    </>
  );
}
