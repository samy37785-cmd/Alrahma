import { useEffect, useRef, useState } from 'react';

const COUNTRIES = [
  { flag: '🇬🇧', name: 'UK' },
  { flag: '🇩🇪', name: 'Germany' },
  { flag: '🇫🇷', name: 'France' },
  { flag: '🇮🇹', name: 'Italy' },
  { flag: '🇪🇸', name: 'Spain' },
  { flag: '🇳🇱', name: 'Netherlands' },
  { flag: '🇺🇸', name: 'USA' },
  { flag: '🇨🇦', name: 'Canada' },
  { flag: '🇦🇺', name: 'Australia' },
  { flag: '🇸🇪', name: 'Sweden' },
  { flag: '🇳🇴', name: 'Norway' },
  { flag: '🇧🇪', name: 'Belgium' },
  { flag: '🇨🇭', name: 'Switzerland' },
  { flag: '🇦🇹', name: 'Austria' },
  { flag: '🇩🇰', name: 'Denmark' },
  { flag: '🇵🇹', name: 'Portugal' },
  { flag: '🇬🇷', name: 'Greece' },
  { flag: '🇵🇱', name: 'Poland' },
  { flag: '🇹🇷', name: 'Turkey' },
  { flag: '🇸🇦', name: 'Saudi Arabia' },
  { flag: '🇦🇪', name: 'UAE' },
  { flag: '🇲🇾', name: 'Malaysia' },
  { flag: '🇺🇿', name: 'Uzbekistan' },
  { flag: '🇮🇩', name: 'Indonesia' },
  { flag: '🇿🇦', name: 'South Africa' },
];

function useIsBusinessHours() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    const check = () => {
      // Cairo time (UTC+2 / UTC+3 DST), approximate check
      const cairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const h = cairo.getHours();
      const day = cairo.getDay();
      // Sun=0, Sat=6; available Sat-Thu 8am-11pm Cairo time
      const workday = day !== 5; // Friday is rest day
      setStatus(workday && h >= 8 && h < 23 ? 'online' : 'offline');
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);
  return status;
}

export default function TrustBar() {
  const trackRef = useRef(null);
  const waStatus = useIsBusinessHours();

  // Duplicate flags for seamless infinite scroll
  const doubled = [...COUNTRIES, ...COUNTRIES];

  return (
    <section className="trust-bar" aria-label="Trusted worldwide">
      <div className="container">

        {/* Top row: headline trust stats */}
        <div className="trust-bar__stats">
          <div className="trust-bar__stat">
            <span className="trust-bar__stat-num">40+</span>
            <span className="trust-bar__stat-label">Countries</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__stat">
            <span className="trust-bar__stat-num">1,200+</span>
            <span className="trust-bar__stat-label">Active students</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__stat">
            <span className="trust-bar__stat-num">32</span>
            <span className="trust-bar__stat-label">Al-Azhar certified tutors</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__stat">
            <span className="trust-bar__stat-num">14-day</span>
            <span className="trust-bar__stat-label">Money-back guarantee</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__stat">
            <a
              href="https://wa.me/201016054663"
              target="_blank"
              rel="noopener noreferrer"
              className="trust-bar__wa"
              aria-label="WhatsApp support status"
            >
              <span
                className={`trust-bar__wa-dot${waStatus === 'online' ? ' trust-bar__wa-dot--on' : ''}`}
                aria-hidden="true"
              />
              <span>
                <strong>{waStatus === 'online' ? 'Support online' : 'Leave a message'}</strong>
                <span className="trust-bar__wa-sub">
                  {waStatus === 'online' ? 'Typically replies in minutes' : 'We reply within a few hours'}
                </span>
              </span>
            </a>
          </div>
        </div>

        {/* Scrolling country flags */}
        <div className="trust-bar__flags-wrap" aria-hidden="true">
          <div className="trust-bar__flags-track" ref={trackRef}>
            {doubled.map((c, i) => (
              <div className="trust-bar__flag" key={i} title={c.name}>
                <span>{c.flag}</span>
                <span className="trust-bar__flag-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges row */}
        <div className="trust-bar__badges">
          <div className="trust-bar__badge">
            <span className="trust-bar__badge-icon">🔒</span>
            <span>No long-term contract</span>
          </div>
          <div className="trust-bar__badge">
            <span className="trust-bar__badge-icon">💳</span>
            <span>Cancel anytime</span>
          </div>
          <div className="trust-bar__badge">
            <span className="trust-bar__badge-icon">🎓</span>
            <span>Ijazah-certified chain</span>
          </div>
          <div className="trust-bar__badge">
            <span className="trust-bar__badge-icon">👩‍🏫</span>
            <span>Female tutors available</span>
          </div>
          <div className="trust-bar__badge">
            <span className="trust-bar__badge-icon">🕐</span>
            <span>24 / 7 scheduling</span>
          </div>
          <div className="trust-bar__badge">
            <span className="trust-bar__badge trust-bar__badge--gdpr-tag" aria-label="GDPR Compliant">GDPR</span>
            <span>Compliant</span>
          </div>
          <div className="trust-bar__badge">
            <span className="trust-bar__badge-icon">⚡</span>
            <span>Reply within 2 hours</span>
          </div>
        </div>

      </div>
    </section>
  );
}
