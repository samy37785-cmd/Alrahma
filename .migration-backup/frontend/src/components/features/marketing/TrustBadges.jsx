import Reveal from '../../ui/Reveal';
import { useLang } from '../../../context/LangContext';

const COUNTRIES = [
  { flag: '🇬🇧', name: 'UK' },
  { flag: '🇩🇪', name: 'Germany' },
  { flag: '🇫🇷', name: 'France' },
  { flag: '🇮🇹', name: 'Italy' },
  { flag: '🇪🇸', name: 'Spain' },
  { flag: '🇳🇱', name: 'Netherlands' },
  { flag: '🇸🇪', name: 'Sweden' },
  { flag: '🇨🇦', name: 'Canada' },
  { flag: '🇺🇸', name: 'USA' },
  { flag: '🇦🇺', name: 'Australia' },
  { flag: '🇧🇪', name: 'Belgium' },
  { flag: '🇨🇭', name: 'Switzerland' },
  { flag: '🇦🇹', name: 'Austria' },
  { flag: '🇵🇹', name: 'Portugal' },
  { flag: '🇳🇴', name: 'Norway' },
];

/* Inline SVG icons — same Lucide-style, 24×24 viewBox, white stroke used by
   Features.jsx, replacing raw emoji so the trust stat cards match the rest
   of the page's icon language instead of introducing a third style. */
const TRUST_ICONS = [
  /* 0 — Graduation cap: Al-Azhar Certified Tutors */
  <svg key="grad" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>,
  /* 1 — Zap: Support Response Time */
  <svg key="zap" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>
  </svg>,
  /* 2 — Globe: Countries (same path as Features.jsx's Multilingual icon) */
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>,
  /* 3 — Shield-check: Day Refund Guarantee (same path as Features.jsx's Al-Azhar Certified icon) */
  <svg key="shield" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>,
];

export default function TrustBadges() {
  const { t } = useLang();
  const tr = t.trust;

  return (
    <section className="trust" aria-label="Trust signals">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{tr.eyebrow}</p>
          <h2>{tr.heading}</h2>
          <p className="section-sub">{tr.sub}</p>
        </Reveal>

        {/* Main trust stats */}
        <div className="trust__grid">
          {tr.items.map((item, i) => (
            <Reveal key={i} className="trust__card">
              <div className="trust__card-icon-wrap"><span className="trust__card-icon">{TRUST_ICONS[i]}</span></div>
              <div className="trust__card-stat">{item.stat}</div>
              <div className="trust__card-label">{item.label}</div>
              <p className="trust__card-desc">{item.desc}</p>
            </Reveal>
          ))}
        </div>

        {/* GDPR + Response time row */}
        <Reveal className="trust__badges-row">
          <div className="trust__badge trust__badge--gdpr">
            <span className="trust__gdpr-seal" aria-hidden="true">GDPR</span>
            <div>
              <strong>{tr.gdprTitle}</strong>
              <span>{tr.gdprDesc}</span>
            </div>
          </div>

          <div className="trust__badge trust__badge--ssl">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div>
              <strong>{tr.sslTitle}</strong>
              <span>{tr.sslDesc}</span>
            </div>
          </div>

          <div className="trust__badge trust__badge--support">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div>
              <strong>{tr.supportTitle}</strong>
              <span>{tr.supportDesc}</span>
            </div>
          </div>

          <div className="trust__badge trust__badge--azhar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <div>
              <strong>{tr.azharTitle}</strong>
              <span>{tr.azharDesc}</span>
            </div>
          </div>
        </Reveal>

        {/* Countries flags marquee */}
        <Reveal className="trust__countries">
          <p className="trust__countries-label">
            <strong>{tr.countriesLabel}</strong>
          </p>
          <div className="trust__flags" aria-label="Countries represented">
            <div className="trust__flags-track" aria-hidden="true">
              {[...COUNTRIES, ...COUNTRIES].map((c, i) => (
                <span key={i} className="trust__flag" title={c.name}>{c.flag}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
