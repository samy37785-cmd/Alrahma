import { useLang } from '../../context/LangContext';
import { openConsentSettings } from '../../analytics/consent';
import { pickConsentCopy } from '../../analytics/consentCopy';
import { getMeasurementId } from '../../analytics/ga';
import '../../styles/consent.css';

// Re-opens the consent banner so a visitor can withdraw (or give) analytics
// consent at any time. Hidden while no Measurement ID is configured.
export default function CookieSettingsButton({ prefix = null }) {
  const { lang } = useLang();
  if (!getMeasurementId()) return null;
  return (
    <>
      {prefix}
      <button type="button" className="consent-settings-link" onClick={openConsentSettings}>
        {pickConsentCopy(lang).settings}
      </button>
    </>
  );
}
