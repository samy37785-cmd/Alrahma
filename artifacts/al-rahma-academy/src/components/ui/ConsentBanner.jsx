import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext';
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  useAnalyticsConsent,
  useConsentSettingsRequests,
  writeConsent,
} from '../../analytics/consent';
import { pickConsentCopy } from '../../analytics/consentCopy';
import { getMeasurementId } from '../../analytics/ga';
import '../../styles/consent.css';

// Shown until the visitor makes a choice, and again whenever "Cookie
// settings" is opened. Hidden entirely while no Measurement ID is configured
// (there is nothing to consent to), and during the build-time prerender
// (headless Chromium reports navigator.webdriver) so the banner is never
// baked into static HTML.
export default function ConsentBanner() {
  const { lang } = useLang();
  const consent = useAnalyticsConsent();
  const [reopened, setReopened] = useState(false);
  const openSettings = useCallback(() => setReopened(true), []);
  useConsentSettingsRequests(openSettings);

  if (!getMeasurementId()) return null;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return null;
  if (consent !== null && !reopened) return null;

  const copy = pickConsentCopy(lang);
  const choose = (value) => {
    writeConsent(value);
    setReopened(false);
  };

  return (
    <section className="consent-banner" role="region" aria-label={copy.region} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <p className="consent-banner__text">
        {copy.message}{' '}
        <Link to="/academy/privacy">{copy.privacy}</Link>
      </p>
      <div className="consent-banner__actions">
        <button type="button" className="btn btn--ghost" onClick={() => choose(CONSENT_DENIED)}>
          {copy.reject}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => choose(CONSENT_GRANTED)}>
          {copy.accept}
        </button>
      </div>
    </section>
  );
}
