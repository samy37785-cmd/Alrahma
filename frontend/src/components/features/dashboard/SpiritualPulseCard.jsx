import { Link } from 'react-router-dom';
import { Moon } from 'lucide-react';
import { TOOLS_TEXT, pick } from '../../../i18n/content';
import { PRAYERS_ORDER, PRAYER_META } from '../../../utils/islamicToolsUtils';

export default function SpiritualPulseCard({ t, lang }) {
  const prayerNames = pick(TOOLS_TEXT, lang).prayers;
  return (
    <div className="ds-card">
      <div className="ds-card__hd" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="ds-card__title">
            <span className="ds-card__title-icon"><Moon size={14} aria-hidden="true" /></span> {t.dashboard.pulseTitle}
          </h2>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>
      <div className="ds-card__body">
        <div className="ds-pulse">
          {PRAYERS_ORDER.filter((name) => name !== 'Sunrise').map((name) => (
            <div key={name} className="ds-pulse__chip">
              <span className="ds-pulse__chip-icon" aria-hidden="true" style={{ color: PRAYER_META[name].color }}>{PRAYER_META[name].icon}</span>
              <span className="ds-pulse__chip-name">{prayerNames[name]}</span>
            </div>
          ))}
        </div>
        <Link to="/tools/prayer-times" className="ds-pulse__cta">{t.dashboard.pulseCta}</Link>
      </div>
    </div>
  );
}
