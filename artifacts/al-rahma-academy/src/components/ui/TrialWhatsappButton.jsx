import { useLang } from '../../context/LangContext';
import { getTrialWhatsappText } from '../../i18n/trialWhatsapp';
import { buildTrialWhatsappLink } from '../../utils/whatsapp';

// Optional follow-up shown only after a free-trial request was accepted:
// opens WhatsApp with the visitor's own details pre-filled, so they can send
// them to the academy themselves. Nothing leaves the page until they click.
//
// Deliberately a <button>, not an <a href>: the link carries the visitor's
// details in its query string, and a plain link can be picked up by
// analytics outbound-click tracking (and shows in the status bar). Here the
// URL exists only inside the click handler. Renders nothing when no valid
// academy number is configured (see academyWhatsappNumber).
//
// Inline layout styles only: the shared stylesheets are hash-guarded
// (accessibilityWave4/5 tests); the button reuses the existing .btn classes.
export default function TrialWhatsappButton({ details, className = 'btn btn--green' }) {
  const { lang } = useLang();
  const copy = getTrialWhatsappText(lang);
  const href = details ? buildTrialWhatsappLink(details, copy) : null;
  if (!href) return null;

  return (
    <div className="trial-wa" style={{ marginTop: 12, textAlign: 'center' }}>
      <p className="trial-wa__hint" style={{ fontSize: '.85rem', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        {copy.hint}
      </p>
      <button
        type="button"
        className={className}
        onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
      >
        {copy.button}
      </button>
    </div>
  );
}
