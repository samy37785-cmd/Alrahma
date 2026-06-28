import Reveal from './ui/Reveal';
import { useLang } from '../context/LangContext';

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

const TRUST_ITEMS = [
  {
    icon: '🎓',
    stat: '32',
    label: 'Al-Azhar Certified Tutors',
    desc: 'Every tutor holds a verified Ijazah with an unbroken chain of knowledge traced back to the Prophet ﷺ.',
  },
  {
    icon: '⚡',
    stat: '< 2h',
    label: 'Support Response Time',
    desc: 'We answer every message within 2 hours — because your learning journey cannot wait.',
  },
  {
    icon: '🌍',
    stat: '40+',
    label: 'Countries',
    desc: 'Families from over 40 countries trust Al-Rahma Academy for authentic Quran education.',
  },
  {
    icon: '🛡️',
    stat: '14',
    label: 'Day Refund Guarantee',
    desc: 'Not satisfied? We refund 100% within 14 days — no questions, no paperwork, no risk.',
  },
];

export default function TrustBadges() {
  const { t } = useLang();
  void t;

  return (
    <section className="trust" aria-label="Trust signals">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Why families trust us</p>
          <h2>Built on Transparency &amp; Authenticity</h2>
          <p className="section-sub">
            Every claim on this page is verifiable. We believe trust is earned through evidence, not promises.
          </p>
        </Reveal>

        {/* Main trust stats */}
        <div className="trust__grid">
          {TRUST_ITEMS.map((item) => (
            <Reveal key={item.label} className="trust__card">
              <div className="trust__card-icon">{item.icon}</div>
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
              <strong>GDPR Compliant</strong>
              <span>Your data is protected under EU regulation. No data sold. Ever.</span>
            </div>
          </div>

          <div className="trust__badge trust__badge--ssl">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div>
              <strong>SSL Encrypted</strong>
              <span>All payments and personal data are encrypted end-to-end.</span>
            </div>
          </div>

          <div className="trust__badge trust__badge--support">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div>
              <strong>2-Hour Support</strong>
              <span>Real humans, not bots. We respond within 2 hours, 7 days a week.</span>
            </div>
          </div>

          <div className="trust__badge trust__badge--azhar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <div>
              <strong>Al-Azhar Verified</strong>
              <span>Official partnership with tutors certified by Al-Azhar University, Cairo.</span>
            </div>
          </div>
        </Reveal>

        {/* Countries flags marquee */}
        <Reveal className="trust__countries">
          <p className="trust__countries-label">
            <strong>Students from 40+ countries</strong> trust Al-Rahma Academy
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
