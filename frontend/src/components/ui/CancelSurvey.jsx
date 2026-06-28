import { useState } from 'react';
import { site } from '../../data/site';

const REASONS = [
  { id: 'price',     label: 'The price is too high for me' },
  { id: 'schedule',  label: 'The schedule doesn\'t fit my life' },
  { id: 'tutor',    label: 'I want a different tutor style' },
  { id: 'progress', label: 'I\'m not seeing enough progress' },
  { id: 'moving',   label: 'I\'m using a different platform now' },
  { id: 'pause',    label: 'I need a break — I may return' },
  { id: 'other',    label: 'Something else' },
];

const OFFERS = {
  price:    { icon: '💰', text: 'We can move you to the Starter plan — same quality, lower cost. Would that help?', action: 'Switch to Starter Plan' },
  schedule: { icon: '🕒', text: 'We can reschedule all your sessions to any time that works — 24/7 flexibility. Want to try a new slot?', action: 'Find a Better Time' },
  tutor:    { icon: '👨‍🏫', text: 'We can match you with a different tutor within 48 hours — completely free. No friction.', action: 'Request Tutor Change' },
  progress: { icon: '📈', text: 'Let\'s talk to your tutor about adjusting the pace. Would a free progress review session help?', action: 'Book Progress Review' },
  pause:    { icon: '⏸️', text: 'We can pause your subscription for up to 2 months and resume where you left off — no loss of sessions.', action: 'Pause Instead' },
};

export default function CancelSurvey({ onConfirmCancel, onClose }) {
  const [step, setStep] = useState('reason');
  const [selected, setSelected] = useState(null);
  const [other, setOther] = useState('');

  const offer = OFFERS[selected];

  const handleSubmit = () => {
    if (!selected) return;
    if (offer) { setStep('offer'); } else { setStep('confirm'); }
  };

  if (step === 'offer') {
    return (
      <div className="cancel-survey" role="dialog" aria-modal="true" aria-label="Before you cancel">
        <div className="cancel-survey__card">
          <button className="cancel-survey__x" onClick={onClose} aria-label="Close">×</button>
          <div className="cancel-survey__offer-icon" aria-hidden="true">{offer.icon}</div>
          <h3 className="cancel-survey__title">Before you go…</h3>
          <p className="cancel-survey__offer-text">{offer.text}</p>
          <div className="cancel-survey__actions">
            <a
              href={`https://wa.me/${site.whatsapp}?text=Hi%2C%20I%20was%20about%20to%20cancel%20because%3A%20${encodeURIComponent(REASONS.find(r=>r.id===selected)?.label||'')}.%20Can%20you%20help%3F`}
              target="_blank" rel="noopener noreferrer"
              className="btn btn--gold btn--block"
            >
              💬 {offer.action}
            </a>
            <button type="button" className="cancel-survey__skip" onClick={() => setStep('confirm')}>
              No thanks — continue cancelling
            </button>
          </div>
        </div>
        <div className="cancel-survey__backdrop" onClick={onClose} aria-hidden="true" />
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="cancel-survey" role="dialog" aria-modal="true" aria-label="Confirm cancellation">
        <div className="cancel-survey__card">
          <button className="cancel-survey__x" onClick={onClose} aria-label="Close">×</button>
          <div className="cancel-survey__offer-icon" aria-hidden="true">😔</div>
          <h3 className="cancel-survey__title">We're sorry to see you go</h3>
          <p className="cancel-survey__offer-text">
            Your progress is saved. You can return any time and continue from where you left off.
            Remember: our <strong>14-day money-back guarantee</strong> means you can also request a
            full refund if this is your first billing period.
          </p>
          <div className="cancel-survey__actions">
            <a
              href={`mailto:${site.email}?subject=Cancellation%20Request&body=Reason%3A%20${encodeURIComponent(REASONS.find(r=>r.id===selected)?.label||'')}`}
              className="btn btn--green btn--block"
            >
              ✉️ Request Refund Instead
            </a>
            <button type="button" className="cancel-survey__danger" onClick={onConfirmCancel}>
              Cancel subscription
            </button>
          </div>
        </div>
        <div className="cancel-survey__backdrop" onClick={onClose} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="cancel-survey" role="dialog" aria-modal="true" aria-label="Cancellation survey">
      <div className="cancel-survey__card">
        <button className="cancel-survey__x" onClick={onClose} aria-label="Close">×</button>
        <h3 className="cancel-survey__title">We're sorry to hear that</h3>
        <p className="cancel-survey__sub">
          Help us improve — what's the main reason you're cancelling?
        </p>
        <div className="cancel-survey__reasons">
          {REASONS.map((r) => (
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
              placeholder="Tell us more (optional)…"
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
            Continue
          </button>
          <button type="button" className="cancel-survey__skip" onClick={onClose}>
            Keep my subscription
          </button>
        </div>
      </div>
      <div className="cancel-survey__backdrop" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
