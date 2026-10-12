import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/islamic-tools.css';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';
import NotFound from '../NotFound';
import { TOOLS_TEXT, pick } from '../../i18n/content';
import { PRAYER_CITY_TEXT, needsHighLatitudeNote } from '../../i18n/tools/prayerCities';
import { findPrayerCity, prayerCitiesFor, prayerCityRoute } from '../../data/prayerCities';
import { PRAYER_TABLES, PRAYER_TABLE_YEAR } from '../../data/prayerCityTables';
import { siteFacts } from '../../data/siteFacts';
import { PRAYER_META, fetchPrayerCoords, stripParens } from '../../utils/islamicToolsUtils';

// Muslim World League (AlAdhan method 3) and standard Asr (school 0): the same
// settings the yearly table in prayerCityTables.js was fetched with.
const METHOD_MWL = 3;
const SCHOOL_STANDARD = 0;
const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function shortDate(lang, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

// One page per city, published only in its country's language. Any other
// language (or an unknown slug) renders the 404 page, which is noindex.
export default function CityPrayerTimesPage({ slug }) {
  const { lang } = useLang();
  const city = findPrayerCity(slug);
  if (!city || city.locale !== lang || !PRAYER_CITY_TEXT[lang]) return <NotFound />;
  return <CityPrayerTimes city={city} lang={lang} />;
}

function CityPrayerTimes({ city, lang }) {
  const t = PRAYER_CITY_TEXT[lang];
  const tx = pick(TOOLS_TEXT, lang);
  const year = PRAYER_TABLE_YEAR;
  const rows = PRAYER_TABLES[city.slug] || [];
  const hasAfterMidnight = rows.some((row) => row[6] < '12:00');
  const others = prayerCitiesFor(lang).filter((c) => c.slug !== city.slug);

  useSEO({ title: t.seo.title(city), description: t.seo.description(city, year) });

  const [today, setToday] = useState(null);
  const [todayState, setTodayState] = useState('idle');

  // Today's times come from AlAdhan in the browser. The build-time prerender
  // (navigator.webdriver, see PrayerTimesPage.jsx) skips the request, so the
  // static HTML never contains one particular day's times.
  useEffect(() => {
    if (navigator.webdriver) return undefined;
    let active = true;
    setTodayState('loading');
    fetchPrayerCoords(city.lat, city.lng, METHOD_MWL, SCHOOL_STANDARD)
      .then((data) => { if (active) { setToday(data); setTodayState('done'); } })
      .catch(() => { if (active) setTodayState('error'); });
    return () => { active = false; };
  }, [city.slug, city.lat, city.lng]);

  return (
    <>
      <Header />
      <main id="main-content" className="it__main">
        <Breadcrumbs items={[
          { label: t.breadcrumbs.tools, to: '/tools' },
          { label: t.breadcrumbs.prayerTools, to: '/tools/prayer' },
          { label: t.breadcrumbs.prayerTimes, to: '/tools/prayer-times' },
          { label: city.name },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{tx.eyebrow}</p>
            <h1>{t.h1(city)}</h1>
            <p className="it__hero-sub">{t.intro(city, year)}</p>
          </div>
        </section>

        <div className="container it__body">
          <div className="it__prayer-page it__city">

            {todayState !== 'idle' && (
              <section className="it__city-section" aria-labelledby="city-today">
                <h2 id="city-today">{t.today.title(city)}</h2>
                {todayState === 'loading' && <p className="it__city-note">{t.today.loading}</p>}
                {todayState === 'error' && <p className="it__city-note">{t.today.error}</p>}
                {todayState === 'done' && today && (
                  <ul className="it__prayer-list">
                    {PRAYERS.map((name) => (
                      <li key={name} className={`it__prayer-item${name === 'Sunrise' ? ' it__prayer-item--sunrise' : ''}`}>
                        <span className="it__pi-icon" style={{ color: PRAYER_META[name].color }}>{PRAYER_META[name].icon}</span>
                        <div className="it__pi-names">
                          <span className="it__pi-ar">{tx.prayers[name]}</span>
                          <span className="it__pi-en">{PRAYER_META[name].ar}</span>
                        </div>
                        <span className="it__pi-time">{stripParens(today.timings[name])}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="it__city-section" aria-labelledby="city-year">
              <h2 id="city-year">{t.table.title(city, year)}</h2>
              <p className="it__city-note">{t.table.note}</p>
              <div className="it__month-wrap">
                <table className="it__month-table">
                  <caption className="sr-only">{t.table.caption(city, year)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{tx.cols.date}</th>
                      {PRAYERS.map((name) => <th key={name} scope="col">{tx.cols[name]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([date, ...times]) => (
                      <tr key={date}>
                        <th scope="row">{shortDate(lang, date)}</th>
                        {times.map((time, i) => <td key={PRAYERS[i]}>{time}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasAfterMidnight && <p className="it__city-note">{t.table.afterMidnight}</p>}
            </section>

            <section className="it__city-section" aria-labelledby="city-qibla">
              <h2 id="city-qibla">{t.qibla.title(city)}</h2>
              <p>{t.qibla.text(city)}</p>
            </section>

            <section className="it__city-section" aria-labelledby="city-method">
              <h2 id="city-method">{t.method.title}</h2>
              <p>{t.method.angles}</p>
              {needsHighLatitudeNote(city) && <p>{t.method.highLatitude(city)}</p>}
              <p>{t.method.mosque(city)}</p>
              <p>{t.method.hanafi}</p>
              <p>
                {t.tool.text}{' '}
                <Link to="/tools/prayer-times">{t.tool.link}</Link>
              </p>
            </section>

            <p className="it__city-cta">
              {t.trial.text(siteFacts.trialLessonMinutes)}{' '}
              <Link to="/enroll">{t.trial.link}</Link>
            </p>
          </div>

          <nav className="it__also-try" aria-label={t.otherCities}>
            <span className="it__also-try__label">{t.otherCities}</span>
            {others.map((c) => <Link key={c.slug} to={prayerCityRoute(c.slug)}>{c.name}</Link>)}
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
