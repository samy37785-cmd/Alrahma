import { withCache, TTL } from '../api/cache';

export const MECCA = { lat: 21.4225, lng: 39.8262 };

export const PRAYERS_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
export const PRAYER_META = {
  Fajr:    { ar: 'الفجر',   icon: '🌙', color: '#1a3a5c' },
  Sunrise: { ar: 'الشروق',  icon: '🌅', color: '#e07820' },
  Dhuhr:   { ar: 'الظهر',   icon: '☀️', color: '#d4af37' },
  Asr:     { ar: 'العصر',   icon: '🌤', color: '#0b6e4f' },
  Maghrib: { ar: 'المغرب',  icon: '🌇', color: '#7a3a8a' },
  Isha:    { ar: 'العشاء',  icon: '⭐', color: '#1a5fa0' },
};

export const EXTRA_ORDER = ['Imsak', 'Midnight', 'Lastthird'];
export const EXTRA_META = {
  Imsak:     { ar: 'الإمساك (السحور)',     icon: '🌃', color: '#5a4b8a' },
  Midnight:  { ar: 'منتصف الليل',          icon: '🌌', color: '#34495e' },
  Lastthird: { ar: 'الثلث الأخير (قيام)',  icon: '✨', color: '#2c3e50' },
};

export const ASR_SCHOOLS = [
  { id: 0, ar: 'الجمهور (شافعي/مالكي/حنبلي)', en: 'Standard (Shafii)' },
  { id: 1, ar: 'الحنفي',                       en: 'Hanafi' },
];

export const CALC_METHODS = [
  { id: 3,  name: 'الهيئة المصرية العامة للمساحة',          en: 'Egyptian Authority' },
  { id: 4,  name: 'أم القرى (مكة المكرمة)',                 en: 'Umm Al-Qura, Makkah' },
  { id: 1,  name: 'رابطة العالم الإسلامي',                  en: 'Muslim World League' },
  { id: 2,  name: 'جمعية إسلامية لأمريكا الشمالية (ISNA)', en: 'ISNA' },
  { id: 5,  name: 'جامعة العلوم الإسلامية، كراتشي',         en: 'Karachi' },
  { id: 12, name: 'الاتحاد الإسلامي الأوروبي',              en: 'Union of Islamic Orgs. (France)' },
];

export const DAILY_VERSE_KEYS = [
  '2:255','2:286','1:1','3:173','13:28','17:9','18:10','20:114',
  '33:56','39:53','49:13','55:13','65:3','94:5','103:1','112:1',
  '2:152','9:51','57:3','3:200',
];

export function stripParens(t = '') { return t.replace(/\s*\([^)]*\)/g, '').trim(); }

export function to12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function fmtTime(t, is12) { const s = stripParens(t); return is12 ? to12h(s) : s; }

export function fmtClock(hms, is12) {
  if (!is12 || !hms) return hms;
  const [h, m, s] = hms.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ap}`;
}

export function parseMins(t) { const [h, m] = stripParens(t).split(':').map(Number); return h * 60 + m; }

export function tzNowSecs(tz) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date());
  const g = (type) => Number(p.find((x) => x.type === type)?.value) || 0;
  return (g('hour') % 24) * 3600 + g('minute') * 60 + g('second');
}

export function tzClock(tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
}

export function nextPrayerInfo(timings, nowSecs = tzNowSecs()) {
  const relevant = PRAYERS_ORDER.filter((p) => p !== 'Sunrise');
  for (const name of relevant) {
    const ps = parseMins(timings[name]) * 60;
    if (ps > nowSecs) return { name, secsLeft: ps - nowSecs };
  }
  const ps = parseMins(timings.Fajr) * 60;
  return { name: 'Fajr', secsLeft: 86400 - nowSecs + ps };
}

export function formatHMS(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function qiblaBearing(userLat, userLng) {
  const lat1 = userLat * Math.PI / 180;
  const lat2 = MECCA.lat * Math.PI / 180;
  const dLon  = (MECCA.lng - userLng) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

export function qiblaDistance(userLat, userLng) {
  const R = 6371;
  const dLat = (MECCA.lat - userLat) * Math.PI / 180;
  const dLon  = (MECCA.lng - userLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(userLat*Math.PI/180)*Math.cos(MECCA.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export function daysUntilHijriEvent(hijri, targetMonth, targetDay) {
  const cm = parseInt(hijri.month.number);
  const cd = parseInt(hijri.day);
  if (cm === targetMonth && cd === targetDay) return 0;
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

export const dayKey = () => new Date().toISOString().slice(0, 10);

export async function fetchPrayerCoords(lat, lng, method, school = 0) {
  const key = `prayer:coords:${lat.toFixed(3)},${lng.toFixed(3)}:${method}:${school}:${dayKey()}`;
  return withCache(key, 6 * TTL.HOUR, async () => {
    const ts = Math.floor(Date.now() / 1000);
    const r = await fetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`);
    if (!r.ok) throw new Error('API');
    return (await r.json()).data;
  });
}

export async function fetchPrayerCity(city, method, school = 0) {
  const key = `prayer:city:${city.toLowerCase()}:${method}:${school}:${dayKey()}`;
  return withCache(key, 6 * TTL.HOUR, async () => {
    const r = await fetch(`https://api.aladhan.com/v1/timingsByAddress?address=${encodeURIComponent(city)}&method=${method}&school=${school}`);
    if (!r.ok) throw new Error('city');
    const j = await r.json();
    if (j.code !== 200 || !j.data?.timings) throw new Error('city');
    return j.data;
  });
}

export async function fetchMonth({ city, lat, lng }, method, school, month, year) {
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
