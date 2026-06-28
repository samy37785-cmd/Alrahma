import { useState } from 'react';
import { subscribeNewsletter } from '../api/client';
import { useLang } from '../context/LangContext';

const GUIDE_BENEFITS = [
  { icon: '📖', text: '12-page illustrated Tajweed guide (PDF)' },
  { icon: '🎧', text: '5 audio pronunciation examples' },
  { icon: '🗓️', text: '30-day beginner memorisation plan' },
];

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const { t } = useLang();
  const n = t.newsletter;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    try {
      await subscribeNewsletter(email);
      setEmail('');
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <section className="newsletter newsletter--done">
        <div className="container newsletter__inner">
          <div className="newsletter__success">
            <span className="newsletter__success-icon">📬</span>
            <h2>{n.successHeading || 'Check your inbox!'}</h2>
            <p>{n.successSub || 'Your free Tajweed Starter Guide is on its way. It may take a minute or two.'}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="newsletter">
      <div className="container newsletter__inner newsletter__inner--guide">

        {/* Left — offer */}
        <div className="newsletter__offer">
          <span className="newsletter__offer-badge">
            {n.badge || 'FREE DOWNLOAD'}
          </span>
          <h2 className="newsletter__offer-title">
            {n.heading || 'Free Tajweed Starter Guide'}
          </h2>
          <p className="newsletter__offer-sub">
            {n.sub || 'Learn the 5 most common Tajweed rules your child needs before the first lesson — in plain language, no Arabic background required.'}
          </p>
          <ul className="newsletter__benefits">
            {GUIDE_BENEFITS.map((b) => (
              <li key={b.text} className="newsletter__benefit">
                <span className="newsletter__benefit-icon">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — form */}
        <div className="newsletter__form-wrap">
          <div className="newsletter__guide-preview" aria-hidden="true">
            <div className="newsletter__guide-cover">
              <span className="newsletter__guide-cover-arabicبسم">بِسْمِ اللَّهِ</span>
              <span className="newsletter__guide-cover-title">Tajweed<br/>Starter Guide</span>
              <span className="newsletter__guide-cover-badge">FREE</span>
            </div>
          </div>
          <form className="newsletter__form" onSubmit={handleSubmit}>
            <input
              type="email"
              className="newsletter__input"
              placeholder={n.placeholder || 'Your email address'}
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'loading'}
              required
            />
            <button
              type="submit"
              className="btn btn--gold btn--lg newsletter__submit"
              disabled={status === 'loading'}
            >
              {status === 'loading'
                ? (n.subscribing || 'Sending…')
                : (n.btn || 'Send Me the Free Guide →')}
            </button>
            <p className="newsletter__privacy">
              {n.privacy || 'No spam. Unsubscribe any time.'}
            </p>
          </form>
          {status === 'error' && (
            <p className="newsletter__error">{n.error || 'Something went wrong. Please try again.'}</p>
          )}
        </div>

      </div>
    </section>
  );
}
