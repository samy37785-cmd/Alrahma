import { Link } from 'react-router-dom';
import Reveal from '../../ui/Reveal';
import { useLang } from '../../../context/LangContext';
import { stats, values, siteFacts } from '../../../data';
import { VALUES_TEXT, pick } from '../../../i18n/content';
import { pickFounderStory } from '../../../i18n/about/founderStory';

export default function About() {
  const { t, lang } = useLang();
  const a = t.about;
  const valuesT = pick(VALUES_TEXT, lang);
  const fs = pickFounderStory(lang);

  return (
    <section className="about" id="about">
      <div className="container">
        {/* ── Mission & Stats ── */}
        <div className="about__inner">
          <Reveal className="about__text">
            <p className="eyebrow">{a.eyebrow}</p>
            <h2>{a.heading}</h2>
            <p className="about__desc">{a.description}</p>
            <p className="about__mission">{a.mission}</p>
            <Link to="/enroll" className="btn btn--green" style={{ marginTop: '1.5rem', display: 'inline-flex' }}>
              {t.nav.trial}
            </Link>
          </Reveal>

          <div className="about__right">
            <div className="about__stats">
              {stats.map((s, i) => (
                <Reveal className="stat" key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{a.statsLabel[i] || s.label}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* ── Values ── */}
        <Reveal className="section-head" style={{ marginTop: '80px' }}>
          <p className="eyebrow">{a.valuesHeading}</p>
          <h2>{a.valuesHeading}</h2>
        </Reveal>
        <div className="values__grid">
          {values.map((v, i) => {
            const vt = valuesT[i] || {};
            return (
              <Reveal className="value-card" key={v.title}>
                <span className="value-card__icon">{v.icon}</span>
                <h4 className="value-card__title">{vt.title || v.title}</h4>
                <p className="value-card__desc">{vt.desc || v.desc}</p>
              </Reveal>
            );
          })}
        </div>

        {/* ── Founder Story ── */}
        <Reveal className="founder">
          <div className="founder__avatar" aria-hidden="true">
            <span>م س</span>
          </div>
          <div className="founder__content">
            <p className="eyebrow">{fs.eyebrow}</p>
            <h2 className="founder__title">{fs.title}</h2>
            <p className="founder__body">{fs.body1}</p>
            <p className="founder__body">
              {fs.body2Pre}
              {fs.body2Strong && <strong>{fs.body2Strong}</strong>}
            </p>
            {/* Trust/marketing remediation originally dropped "over 1,200
                families across 40+ countries" for lack of a source (see
                docs/trust-marketing-remediation.md). The Content Truth
                Contract corrective round (2026-09-02) restores the families
                and countries figures using the owner-confirmed numbers in
                siteFacts.js — not the original, unsupported "40+ countries"
                claim. The founder narrative itself remains otherwise
                untouched. */}
            <p className="founder__body">
              {fs.body3Pre}{siteFacts.totalFamilies}{fs.body3Mid}{siteFacts.countriesServed}{fs.body3Post}
            </p>
            <p className="founder__body">{fs.body4}</p>
            <div className="founder__sig">
              <span className="founder__sig-name" dir="rtl">— {fs.sigLine || `${siteFacts.founder}, Founder`}</span>
              <span className="founder__sig-sub">{fs.sigBrand}</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
