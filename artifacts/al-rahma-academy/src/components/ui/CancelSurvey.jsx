import { useState } from 'react';
import { site } from '../../data/site';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';

export default function CancelSurvey({ onConfirmCancel, onClose }) {
  const { lang } = useLang();
  const copy = getExperienceText(lang).cancelSurvey;
  const reasons = copy.reasons;
  const [step, setStep] = useState('reason');
  const [selected, setSelected] = useState(null);
  const [other, setOther] = useState('');

  const offer = copy.offers[selected];
  const reasonLabel = reasons.find((reason) => reason.id === selected)?.label || '';

  const handleSubmit = () => {
    if (!selected) return;
    if (offer) { setStep('offer'); } else { setStep('confirm'); }
  };

  if (step === 'offer') {
    return (
      <div className="cancel-survey" role="dialog" aria-modal="true" aria-label={copy.beforeCancelDialog}>
        <div className="cancel-survey__card">
          <button className="cancel-survey__x" onClick={onClose} aria-label={copy.close}>×</button>
          <div className="cancel-survey__offer-icon" aria-hidden="true">{offer.icon}</div>
          <h3 className="cancel-survey__title">{copy.beforeYouGo}</h3>
          <p className="cancel-survey__offer-text">{offer.text}</p>
          <div className="cancel-survey__actions">
            <a
              href={`https://wa.me/${site.whatsapp}?text=${encodeURIComponent(copy.whatsappMessage(reasonLabel))}`}
              target="_blank" rel="noopener noreferrer"
              className="btn btn--gold btn--block"
            >
              💬 {offer.action}
            </a>
            <button type="button" className="cancel-survey__skip" onClick={() => setStep('confirm')}>
              {copy.continueCancelling}
            </button>
          </div>
        </div>
        <div className="cancel-survey__backdrop" onClick={onClose} aria-hidden="true" />
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="cancel-survey" role="dialog" aria-modal="true" aria-label={copy.confirmDialog}>
        <div className="cancel-survey__card">
          <button className="cancel-survey__x" onClick={onClose} aria-label={copy.close}>×</button>
          <div className="cancel-survey__offer-icon" aria-hidden="true">😔</div>
          <h3 className="cancel-survey__title">{copy.confirmTitle}</h3>
          <p className="cancel-survey__offer-text">{copy.confirmBodyStart} <strong>{copy.guarantee}</strong> {copy.confirmBodyEnd}</p>
          <div className="cancel-survey__actions">
            <a
              href={`mailto:${site.email}?subject=${encodeURIComponent(copy.emailSubject)}&body=${encodeURIComponent(copy.emailBody(reasonLabel))}`}
              className="btn btn--green btn--block"
            >
              ✉️ {copy.requestRefund}
            </a>
            <button type="button" className="cancel-survey__danger" onClick={onConfirmCancel}>
              {copy.cancelSubscription}
            </button>
          </div>
        </div>
        <div className="cancel-survey__backdrop" onClick={onClose} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="cancel-survey" role="dialog" aria-modal="true" aria-label={copy.dialog}>
      <div className="cancel-survey__card">
        <button className="cancel-survey__x" onClick={onClose} aria-label={copy.close}>×</button>
        <h3 className="cancel-survey__title">{copy.title}</h3>
        <p className="cancel-survey__sub">
          {copy.subtitle}
        </p>
        <div className="cancel-survey__reasons">
          {reasons.map((r) => (
            <label key={r.id} className={`cancel-survey__reason${selected === r.id ? ' selected' : ''}`}>
              <input
                type="radio" name="cancel-reason" value={r.id}
                checked={selected === r.id}
                onChange={() => setSelected(r.id)}
                className="cancel-survey__radio"
              />
              {r.label}
            </label>
          ))}
          {selected === 'other' && (
            <textarea
              className="cancel-survey__other"
              placeholder={copy.otherPlaceholder}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              rows={3}
            />
          )}
        </div>
        <div className="cancel-survey__actions">
          <button
            type="button"
            className="btn btn--green btn--block"
            onClick={handleSubmit}
            disabled={!selected}
          >
            {copy.continue}
          </button>
          <button type="button" className="cancel-survey__skip" onClick={onClose}>
            {copy.keepSubscription}
          </button>
        </div>
      </div>
      <div className="cancel-survey__backdrop" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
