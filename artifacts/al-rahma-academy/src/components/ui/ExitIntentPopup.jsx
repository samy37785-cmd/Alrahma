import { useState, useEffect } from 'react';
import { submitTrial } from '../../api/contentApi';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';

const SESSION_KEY = 'ar-exit-shown';

export default function ExitIntentPopup() {
  const { lang } = useLang();
  const copy = getExperienceText(lang).exitIntent;
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    let leaveTimer;

    const handleMouseLeave = (e) => {
      // Only trigger when cursor exits through the top of the viewport
      if (e.clientY <= 10) {
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
          if (!sessionStorage.getItem(SESSION_KEY)) setVisible(true);
        }, 250);
      }
    };

    // Wait 20 s before arming the listener (don't annoy instant bouncers)
    const armTimer = setTimeout(() => {
      document.addEventListener('mouseleave', handleMouseLeave);
    }, 20000);

    return () => {
      clearTimeout(armTimer);
      clearTimeout(leaveTimer);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const close = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
    document.body.style.overflow = '';
  };

  useEffect(() => {
    if (visible) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  if (!visible) return null;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(form.email.trim())) { setError(copy.emailInvalid); return; }
    setLoading(true);
    setError('');
    try {
      await submitTrial({ ...form, source: 'exit-intent' });
      setDone(true);
      sessionStorage.setItem(SESSION_KEY, '1');
      setTimeout(close, 4500);
    } catch {
      setError(copy.submitError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="exit-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={copy.dialog}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="exit-popup">
        <button className="exit-popup__close" onClick={close} aria-label={copy.close}>✕</button>

        {done ? (
          <div className="exit-popup__done">
            <p className="exit-popup__done-emoji" aria-hidden="true">🎉</p>
            <h3>{copy.successTitle}</h3>
            <p>{copy.successBody}</p>
          </div>
        ) : (
          <>
            {/* Left panel — value proposition */}
            <div className="exit-popup__left">
              <p className="exit-popup__arabic" dir="rtl" lang="ar" aria-hidden="true">ٱقْرَأْ</p>
              <h2 className="exit-popup__headline">{copy.title}</h2>
              <p className="exit-popup__body">{copy.body}</p>
              <ul className="exit-popup__perks">
                {copy.perks.map((perk) => <li key={perk}>✓ {perk}</li>)}
              </ul>
            </div>

            {/* Right panel — quick form */}
            <form className="exit-popup__form" onSubmit={handleSubmit} noValidate>
              <h3 className="exit-popup__form-title">{copy.claim}</h3>

              <input
                type="text"
                className="exit-popup__input"
                placeholder={copy.name}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                autoComplete="name"
              />
              <input
                type="email"
                className="exit-popup__input"
                placeholder={copy.email}
                required
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                autoComplete="email"
              />
              <input
                type="tel"
                className="exit-popup__input"
                placeholder={copy.whatsapp}
                value={form.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value)}
                autoComplete="tel"
              />

              {error && <p className="exit-popup__error" role="alert">{error}</p>}

              <button type="submit" className="btn btn--gold btn--block" disabled={loading} aria-busy={loading}>
                {loading ? copy.sending : copy.submit}
              </button>

              <button type="button" className="exit-popup__skip" onClick={close}>
                {copy.skip}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
