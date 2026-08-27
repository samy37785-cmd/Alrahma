import { useState, useEffect } from 'react';
import { submitTrial } from '../../api/contentApi';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';

export default function QuickTrialModal({ open, onClose }) {
  const { lang } = useLang();
  const copy = getExperienceText(lang).quickTrial;
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  // Escape-to-close, initial focus (name input), scroll lock, focus restore —
  // this modal originally hand-rolled the first three; the hook was extracted
  // from here (see useModalA11y.js) and now it consumes it like every other
  // dialog. Visuals (.qtm*) are deliberately bespoke marketing styling and
  // are NOT migrated to .ds-modal chrome.
  const firstRef = useModalA11y(open, onClose);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', whatsapp: '' });
      setDone(false);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(copy.nameRequired); return; }
    if (!EMAIL_RE.test(form.email.trim())) { setError(copy.emailInvalid); return; }
    setLoading(true);
    setError('');
    try {
      await submitTrial({ ...form, source: 'hero-quick-trial' });
      setDone(true);
    } catch {
      setError(copy.submitError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="qtm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={copy.dialog}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="qtm">
        <button className="qtm__close" onClick={onClose} aria-label={copy.close}>✕</button>

        {done ? (
          <div className="qtm__success">
            <div className="qtm__success-icon" aria-hidden="true">🎉</div>
            <h2>{copy.successTitle}</h2>
            <p>{copy.successBody}</p>
            <p className="qtm__blessing" dir="rtl" lang="ar">بارك الله فيكم</p>
            <button className="btn btn--green btn--block" onClick={onClose}>
              {copy.successAction}
            </button>
          </div>
        ) : (
          <>
            <div className="qtm__header">
              <span className="qtm__badge" aria-hidden="true">🎓</span>
              <h2 className="qtm__title">{copy.title}</h2>
              <p className="qtm__sub">{copy.subtitle}</p>
            </div>

            <form className="qtm__form" onSubmit={handleSubmit} noValidate>
              <div className="qtm__field">
                <label htmlFor="qtm-name">{copy.name}</label>
                <input
                  id="qtm-name"
                  ref={firstRef}
                  type="text"
                  placeholder={copy.namePlaceholder}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="qtm__field">
                <label htmlFor="qtm-email">{copy.email}</label>
                <input
                  id="qtm-email"
                  type="email"
                  placeholder="you@email.com"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="qtm__field">
                <label htmlFor="qtm-wa">
                  {copy.whatsapp}
                  <span className="qtm__optional">{copy.optional}</span>
                </label>
                <input
                  id="qtm-wa"
                  type="tel"
                  placeholder="+44 7700 900000"
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value)}
                  autoComplete="tel"
                />
              </div>

              {error && <p className="qtm__error" role="alert">{error}</p>}

              <button type="submit" className="btn btn--gold btn--block" disabled={loading} aria-busy={loading}>
                {loading ? copy.booking : copy.submit}
              </button>
            </form>

            <ul className="qtm__footer">
              {copy.perks.map((perk) => <li key={perk}>✓ {perk}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
