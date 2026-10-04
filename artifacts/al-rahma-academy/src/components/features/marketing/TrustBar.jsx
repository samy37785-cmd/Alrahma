import { useEffect, useRef, useState } from 'react';
import Reveal from '../../ui/Reveal';
import { useLang } from '../../../context/LangContext';
import { site } from '../../../data/site';
import { TRUST_BAR_COUNTRIES } from '../../../data/home/countries';
import { COUNTRY_NAMES_TEXT } from '../../../i18n/home/countries';
import { pickLeakedString } from '../../../i18n/home/leakedStrings';
import { pickA11yLabels } from '../../../i18n/a11yLabels';
import { supportStatusAt, msUntilNextCheck } from '../../../utils/cairoSupportHours';

const BADGE_ICONS = ['🔒', '💳', '🎓', '👩‍🏫', '🕐', '📄', '⚡'];

// The first render is always 'neutral' (no time claim), so the prerendered HTML does not
// depend on the clock of the build machine. The live status is computed after mount, in
// the visitor's browser, and re-checked with one timeout at each Cairo hour boundary.
// Under navigator.webdriver (scripts/prerender.mjs, automated crawlers) nothing is
// computed or scheduled, so the static file keeps the neutral text.
function useSupportStatus() {
  const [status, setStatus] = useState('neutral');
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return undefined;
    let id;
    const check = () => {
      const now = new Date();
      const s = supportStatusAt(now);
      setStatus(s === 'unknown' ? 'neutral' : s);
      id = setTimeout(check, msUntilNextCheck(now));
    };
    check();
    return () => clearTimeout(id);
  }, []);
  return status;
}

export default function TrustBar() {
  const trackRef = useRef(null);
  const waStatus = useSupportStatus();
  const { t, lang } = useLang();
  const tb = t.trustBar;
  // Neutral (prerender / no live status): the existing footer strings, "WhatsApp us" and
  // the published support hours, which are true at any time.
  const waText = {
    online: [tb.supportOnline, tb.repliesMinutes],
    offline: [tb.leaveMessage, tb.repliesHours],
    neutral: [t.footer.whatsapp, t.footer.supportHours],
  }[waStatus];
  const countryNames = COUNTRY_NAMES_TEXT[lang] || COUNTRY_NAMES_TEXT.en;

  // Duplicate flags for seamless infinite scroll
  const COUNTRIES = TRUST_BAR_COUNTRIES.map((c) => ({
    ...c,
    name: countryNames[c.id] ?? COUNTRY_NAMES_TEXT.en[c.id],
  }));
  const doubled = [...COUNTRIES, ...COUNTRIES];

  return (
    <Reveal as="section" className="trust-bar" aria-label={pickA11yLabels(lang).trustBar}>
      <div className="container">

        {/* Top row: headline trust stats.
            Trust/marketing remediation: "40+ countries" and "1,200+ active
            students" were deleted outright — no roster/analytics source in
            this repo backs either figure (see
            docs/trust-marketing-remediation.md). "32" Al-Azhar tutors is
            de-numbered to a non-numeric checkmark for the same reason,
            while keeping the (evidenced) qualitative claim. "24-day"
            money-back (owner-confirmed refund window) and the WhatsApp
            business-hours status are kept — both are documented in
            TermsOfService.jsx (§3 refund policy; §13 response-time /
            business-hours policy, which this component's
            useSupportStatus() mirrors exactly, via utils/cairoSupportHours.js). */}
        <div className="trust-bar__stats">
          <div className="trust-bar__stat">
            <span className="trust-bar__stat-num" aria-hidden="true">✓</span>
            <span className="trust-bar__stat-label">{tb.azharTutors}</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__stat">
            <span className="trust-bar__stat-num">{pickLeakedString('refundWindowStat', lang)}</span>
            <span className="trust-bar__stat-label">{tb.moneyBack}</span>
          </div>
          <div className="trust-bar__divider" aria-hidden="true" />
          <div className="trust-bar__stat">
            <a
              href={`https://wa.me/${site.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="trust-bar__wa"
              title={tb.whatsappStatusAriaLabel}
            >
              <span
                className={`trust-bar__wa-dot${waStatus === 'online' ? ' trust-bar__wa-dot--on' : ''}`}
                aria-hidden="true"
              />
              <span>
                <strong>{waText[0]}</strong>
                <span className="trust-bar__wa-sub">{waText[1]}</span>
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
          {tb.badges.map((label, i) => (
            <div className="trust-bar__badge" key={i}>
              <span className="trust-bar__badge-icon">{BADGE_ICONS[i]}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

      </div>
    </Reveal>
  );
}
