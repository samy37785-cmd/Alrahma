import { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/islamic-tools.css';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import { getVerse } from '../api/quran';
import { withCache, TTL } from '../api/cache';
import { useLang } from '../context/LangContext';
import { TOOLS_TEXT, pick } from '../i18n/content';

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════ */
const MECCA = { lat: 21.4225, lng: 39.8262 }; // Kaaba exact coordinates

const PRAYERS_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_META = {
  Fajr:    { ar: 'الفجر',   icon: '🌙', color: '#1a3a5c' },
  Sunrise: { ar: 'الشروق',  icon: '🌅', color: '#e07820' },
  Dhuhr:   { ar: 'الظهر',   icon: '☀️', color: '#d4af37' },
  Asr:     { ar: 'العصر',   icon: '🌤', color: '#0b6e4f' },
  Maghrib: { ar: 'المغرب',  icon: '🌇', color: '#7a3a8a' },
  Isha:    { ar: 'العشاء',  icon: '⭐', color: '#1a5fa0' },
};

// Extra informational times the API also returns (Suhoor / Tahajjud etc.)
const EXTRA_ORDER = ['Imsak', 'Midnight', 'Lastthird'];
const EXTRA_META = {
  Imsak:     { ar: 'الإمساك (السحور)',     icon: '🌃', color: '#5a4b8a' },
  Midnight:  { ar: 'منتصف الليل',          icon: '🌌', color: '#34495e' },
  Lastthird: { ar: 'الثلث الأخير (قيام)',  icon: '✨', color: '#2c3e50' },
};

const ASR_SCHOOLS = [
  { id: 0, ar: 'الجمهور (شافعي/مالكي/حنبلي)', en: 'Standard (Shafii)' },
  { id: 1, ar: 'الحنفي',                       en: 'Hanafi' },
];

const CALC_METHODS = [
  { id: 3,  name: 'الهيئة المصرية العامة للمساحة',         en: 'Egyptian Authority' },
  { id: 4,  name: 'أم القرى (مكة المكرمة)',                en: 'Umm Al-Qura, Makkah' },
  { id: 1,  name: 'رابطة العالم الإسلامي',                 en: 'Muslim World League' },
  { id: 2,  name: 'جمعية إسلامية لأمريكا الشمالية (ISNA)', en: 'ISNA' },
  { id: 5,  name: 'جامعة العلوم الإسلامية، كراتشي',        en: 'Karachi' },
  { id: 12, name: 'الاتحاد الإسلامي الأوروبي',             en: 'Union of Islamic Orgs. (France)' },
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
function to12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
// Format an API time ("HH:MM" possibly with "(+03)") in 12h or 24h.
function fmtTime(t, is12) { const s = stripParens(t); return is12 ? to12h(s) : s; }
// Format the live HH:MM:SS clock in 12h or 24h.
function fmtClock(hms, is12) {
  if (!is12 || !hms) return hms;
  const [h, m, s] = hms.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ap}`;
}
function parseMins(t)        { const [h, m] = stripParens(t).split(':').map(Number); return h * 60 + m; }

// Seconds elapsed today in a given IANA timezone (falls back to device time).
function tzNowSecs(tz) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date());
  const g = (t) => Number(p.find((x) => x.type === t)?.value) || 0;
  return (g('hour') % 24) * 3600 + g('minute') * 60 + g('second');
}

// Live HH:MM:SS clock string for a timezone.
function tzClock(tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
}

// Next upcoming prayer + exact seconds left, computed at `nowSecs` (seconds into the day).
function nextPrayerInfo(timings, nowSecs = tzNowSecs()) {
  const relevant = PRAYERS_ORDER.filter((p) => p !== 'Sunrise');
  for (const name of relevant) {
    const ps = parseMins(timings[name]) * 60;
    if (ps > nowSecs) return { name, secsLeft: ps - nowSecs };
  }
  const ps = parseMins(timings.Fajr) * 60;
  return { name: 'Fajr', secsLeft: 86400 - nowSecs + ps };
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
  // Event is today
  if (cm === targetMonth && cd === targetDay) return 0;
  // Event is still this month
  if (cm === targetMonth && targetDay > cd) return targetDay - cd;
  // Event has passed this month (or is in a future month/next year)
  let days = 30 - cd;
  let m = cm + 1 > 12 ? 1 : cm + 1;
  while (m !== targetMonth) {
    days += 29.5;
    m = m + 1 > 12 ? 1 : m + 1;
  }
  days += targetDay;
  return Math.round(days);
}

// Today's date as a cache-key segment, so prayer times refresh once per day but
// the last good copy still survives an API outage (served stale by withCache).
const dayKey = () => new Date().toISOString().slice(0, 10);

async function fetchPrayerCoords(lat, lng, method, school = 0) {
  const key = `prayer:coords:${lat.toFixed(3)},${lng.toFixed(3)}:${method}:${school}:${dayKey()}`;
  return withCache(key, 6 * TTL.HOUR, async () => {
    const ts = Math.floor(Date.now() / 1000);
    const r = await fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`);
    if (!r.ok) throw new Error('API');
    return (await r.json()).data;
  });
}

async function fetchPrayerCity(city, method, school = 0) {
  // Use timingsByAddress — accepts a free-form place ("Cairo", "London, UK")
  // and geocodes it. (timingsByCity now requires an explicit country.)
  const key = `prayer:city:${city.toLowerCase()}:${method}:${school}:${dayKey()}`;
  return withCache(key, 6 * TTL.HOUR, async () => {
    const r = await fetch(`https://api.aladhan.com/v1/timingsByAddress?address=${encodeURIComponent(city)}&method=${method}&school=${school}`);
    if (!r.ok) throw new Error('city');
    const j = await r.json();
    if (j.code !== 200 || !j.data?.timings) throw new Error('city');
    return j.data;
  });
}

// Full-month timetable. Uses calendarByAddress when we only have a place name,
// otherwise calendar by coordinates. Returns an array of day objects.
async function fetchMonth({ city, lat, lng }, method, school, month, year) {
  const loc = city ? city.toLowerCase() : `${lat},${lng}`;
  const key = `prayer:month:${loc}:${method}:${school}:${year}-${month}`;
  return withCache(key, TTL.DAY, async () => {
    const base = city
      ? `https://api.aladhan.com/v1/calendarByAddress?address=${encodeURIComponent(city)}`
      : `https://api.aladhan.com/v1/calendar/${year}/${month}?latitude=${lat}&longitude=${lng}`;
    const url = city
      ? `${base}&method=${method}&school=${school}&month=${month}&year=${year}`
      : `${base}&method=${method}&school=${school}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('month');
    const j = await r.json();
    if (j.code !== 200 || !Array.isArray(j.data)) throw new Error('month');
    return j.data;
  });
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
  const { t, lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const isAr = lang === 'ar';
  useSEO({
    title: `${t.islamicTools.heading} — Al-Rahma Academy`,
    description: tx.eyebrow,
  });

  const [tab, setTab] = useState('prayer');

  /* ── Location & Prayer ──────────────────────────────────────── */
  const [coords,       setCoords]       = useState(null);
  const [cityInput,    setCityInput]     = useState('');
  const [method,       setMethod]        = useState(3);
  const [school,       setSchool]        = useState(0);
  const [clock12,      setClock12]       = useState(false);
  const [prayerData,   setPrayerData]    = useState(null);
  const [loading,      setLoading]       = useState(true);
  const [error,        setError]         = useState('');
  const [locationName, setLocationName]  = useState('');
  const [nextPrayer,   setNextPrayer]    = useState(null);
  const [secsLeft,     setSecsLeft]      = useState(0);
  const [clock,        setClock]         = useState('');
  const [notifyMins,   setNotifyMins]    = useState(10);
  const [notifyOn,     setNotifyOn]      = useState(false);
  const [notifyPerms,  setNotifyPerms]   = useState('default');
  const timerRef = useRef(null);
  const notifyRef = useRef([]);

  /* ── Monthly timetable ──────────────────────────────────────── */
  const [monthData,  setMonthData]  = useState(null);
  const [monthOpen,  setMonthOpen]  = useState(false);
  const [monthLoad,  setMonthLoad]  = useState(false);

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
          const data = await fetchPrayerCoords(c.latitude, c.longitude, method, school);
          apply(data);
          setBearing(qiblaBearing(c.latitude, c.longitude));
          setDistance(qiblaDistance(c.latitude, c.longitude));
        } catch { setLoading(false); }
      },
      () => setLoading(false),
      { timeout: 8000 }
    );
  }, []); // eslint-disable-line

  /* ── Re-fetch when method or Asr school changes ────────────── */
  useEffect(() => {
    if (!coords && !prayerData) return;
    setLoading(true);
    setMonthData(null); // invalidate cached month table
    const fn = coords
      ? fetchPrayerCoords(coords.lat, coords.lng, method, school)
      : fetchPrayerCity(locationName, method, school);
    fn.then((d) => apply(d, locationName)).catch(() => { setError(tx.errRefetch); setLoading(false); });
  }, [method, school]); // eslint-disable-line

  /* ── City search ────────────────────────────────────────────── */
  const searchCity = async (e) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await fetchPrayerCity(cityInput.trim(), method, school);
      setMonthData(null);
      // Derive coordinates from the API response so Qibla + method re-fetch work for the searched city.
      const lat = Number(data.meta?.latitude);
      const lng = Number(data.meta?.longitude);
      apply(data, cityInput.trim());
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setCoords({ lat, lng });
        setBearing(qiblaBearing(lat, lng));
        setDistance(qiblaDistance(lat, lng));
      } else {
        setCoords(null);
        setBearing(null); setDistance(null);
      }
    } catch { setError(tx.errCity); setLoading(false); }
  };

  /* ── Monthly timetable (lazy) ───────────────────────────────── */
  const toggleMonth = async () => {
    if (monthOpen) { setMonthOpen(false); return; }
    setMonthOpen(true);
    if (monthData || (!coords && !locationName)) return;
    setMonthLoad(true);
    try {
      const now = new Date();
      const loc = coords ? { lat: coords.lat, lng: coords.lng } : { city: locationName };
      const data = await fetchMonth(loc, method, school, now.getMonth() + 1, now.getFullYear());
      setMonthData(data);
    } catch { /* keep silent — button stays available to retry */ }
    finally { setMonthLoad(false); }
  };

  /* ── Live clock + countdown every second (in the location's timezone) ── */
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
    tick(); // run immediately so there's no 1s flash
    clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, 1000);
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
    // Use the prayer location's timezone, not the device's local time.
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
  const compassHandlerRef = useRef(null);

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
    if (compassHandlerRef.current) {
      window.removeEventListener('deviceorientation', compassHandlerRef.current);
    }
    compassHandlerRef.current = handler;
    window.addEventListener('deviceorientation', handler);
    setCompassPerm(true);
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
            <p className="eyebrow">{tx.eyebrow}</p>
            <h1>{t.islamicTools.heading}</h1>
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

        {/* ── Tabs ─────────────────────────────────────────── */}
        <div className="it__tabs-bar">
          <div className="container it__tabs">
            {[
              { key: 'prayer',   icon: '🕌' },
              { key: 'qibla',    icon: '🧭' },
              { key: 'calendar', icon: '📅' },
              { key: 'verse',    icon: '🌟' },
            ].map((tb) => (
              <button
                key={tb.key}
                className={`it__tab${tab === tb.key ? ' active' : ''}`}
                onClick={() => setTab(tb.key)}
              >
                <span>{tb.icon}</span> {tx.tabs[tb.key]}
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
                      <button className="it__notify-btn" onClick={requestNotify}>
                        {tx.enableNotify}
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

              {/* Next prayer banner */}
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

              {!loading && !prayerData && (
                <div className="it__empty">
                  <p>{tx.noLocation}</p>
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
                          <span className="it__pi-ar" dir={isAr ? 'rtl' : 'ltr'}>{tx.prayers[name]}</span>
                          <span className="it__pi-en">{isAr ? name : (PRAYER_META[name].ar)}</span>
                        </div>
                        <span className="it__pi-time">{fmtTime(prayerData.timings[name], clock12)}</span>
                        {isNext && <span className="it__pi-badge">{tx.upcoming}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Extra times: Suhoor / Midnight / Last third (Qiyam) */}
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

              {/* Monthly timetable */}
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
                            <th>{tx.cols.date}</th><th>{tx.cols.Fajr}</th><th>{tx.cols.Sunrise}</th><th>{tx.cols.Dhuhr}</th>
                            <th>{tx.cols.Asr}</th><th>{tx.cols.Maghrib}</th><th>{tx.cols.Isha}</th>
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
          )}

          {/* ══════════════════════════════════════════════════
              QIBLA TAB
              ══════════════════════════════════════════════════ */}
          {tab === 'qibla' && (
            <div className="it__qibla-page">
              <div className="it__qibla-card">
                <h2 className="it__qibla-title">{tx.qibla.title}</h2>

                {bearing !== null ? (
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
                    {compassPerm && (
                      <p className="it__compass-live">{tx.qibla.compassLive}</p>
                    )}
                  </>
                ) : (
                  <div className="it__qibla-no-loc">
                    <p>{tx.qibla.allowFirst}</p>
                    <button className="it__tab-link" onClick={() => setTab('prayer')}>
                      {tx.qibla.goToPrayer}
                    </button>
                  </div>
                )}

                {/* Kaaba info */}
                <div className="it__kaaba-info">
                  <h3>{tx.qibla.kaabaTitle}</h3>
                  <p dir={isAr ? 'rtl' : 'ltr'}>{tx.qibla.kaabaText}</p>
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
                    <p className="it__cal-hijri-date" dir={isAr ? 'rtl' : 'ltr'}>
                      {isAr ? hijri.weekday.ar : hijri.weekday.en} {hijri.day} {isAr ? hijri.month.ar : (tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en)} {hijri.year} {isAr ? 'هـ' : 'AH'}
                    </p>
                    <p className="it__cal-greg">{greg?.weekday?.en}, {greg?.date}</p>
                    <p className="it__cal-month-name">{tx.cal.monthWord} {isAr ? hijri.month.ar : (tx.cal.months[parseInt(hijri.month.number) - 1] || hijri.month.en)}</p>
                  </>
                ) : (
                  <p className="it__cal-no-data">{tx.cal.setDate}</p>
                )}
              </div>

              {/* Islamic occasions countdowns */}
              {hijri && (
                <div className="it__occasions">
                  <h2>{tx.cal.upcoming}</h2>
                  <div className="it__occasions-grid">

                    <div className="it__occasion it__occasion--ramadan">
                      <span className="it__oc-icon">🌙</span>
                      <span className="it__oc-name">{tx.cal.ramadan}</span>
                      <span className="it__oc-days">{daysToRamadan === 0 ? tx.cal.today : `${daysToRamadan} ${tx.cal.days}`}</span>
                      <span className="it__oc-lbl">{isAr ? `1 رمضان ${parseInt(hijri.year) + (daysToRamadan > 300 ? 1 : 0)} هـ` : `1 Ramadan ${parseInt(hijri.year) + (daysToRamadan > 300 ? 1 : 0)} AH`}</span>
                    </div>

                    <div className="it__occasion it__occasion--eid1">
                      <span className="it__oc-icon">🎉</span>
                      <span className="it__oc-name">{tx.cal.eidFitr}</span>
                      <span className="it__oc-days">{daysToEidFitr === 0 ? tx.cal.today : `${daysToEidFitr} ${tx.cal.days}`}</span>
                      <span className="it__oc-lbl">{isAr ? `1 شوال ${parseInt(hijri.year) + (daysToEidFitr > 300 ? 1 : 0)} هـ` : `1 Shawwal ${parseInt(hijri.year) + (daysToEidFitr > 300 ? 1 : 0)} AH`}</span>
                    </div>

                    <div className="it__occasion it__occasion--eid2">
                      <span className="it__oc-icon">🐑</span>
                      <span className="it__oc-name">{tx.cal.eidAdha}</span>
                      <span className="it__oc-days">{daysToEidAdha === 0 ? tx.cal.today : `${daysToEidAdha} ${tx.cal.days}`}</span>
                      <span className="it__oc-lbl">{isAr ? `10 ذو الحجة ${parseInt(hijri.year) + (daysToEidAdha > 300 ? 1 : 0)} هـ` : `10 Dhu al-Hijjah ${parseInt(hijri.year) + (daysToEidAdha > 300 ? 1 : 0)} AH`}</span>
                    </div>

                  </div>

                  {/* Islamic month names reference */}
                  <div className="it__months-ref">
                    <h3>{tx.cal.monthsTitle}</h3>
                    <div className="it__months-grid">
                      {tx.cal.months.map((m, i) => (
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
                  <h2>{tx.verse.title}</h2>
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
                    <p className="it__verse-ref" dir={isAr ? 'rtl' : 'ltr'}>{tx.verse.ref} {verseKey.split(':')[0]} : {verseKey.split(':')[1]}</p>
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
