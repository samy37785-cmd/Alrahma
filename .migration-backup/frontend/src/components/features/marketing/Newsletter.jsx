import { useState } from 'react';
import Reveal from '../../ui/Reveal';
import { subscribeNewsletter } from '../../../api/contentApi';
import { useLang } from '../../../context/LangContext';

/* Inline SVG icons — same Lucide-style used across the homepage, replacing
   raw emoji so the benefits list matches the rest of the icon language. */
const GUIDE_BENEFITS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z"/>
        <path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8Z"/>
      </svg>
    ),
    text: '12-page illustrated Tajweed guide (PDF)',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/>
        <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3Z"/>
      </svg>
    ),
    text: '5 audio pronunciation examples',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    text: '30-day beginner memorisation plan',
  },
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
      <Reveal as="section" className="newsletter newsletter--done">
        <div className="container newsletter__inner">
          <div className="newsletter__success">
            <span className="newsletter__success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Z" />
                <path d="m22 6-10 7L2 6" />
              </svg>
              <span className="newsletter__success-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </span>
            <h2>{n.successHeading || 'Check your inbox!'}</h2>
            <p>{n.successSub || 'Your free Tajweed Starter Guide is on its way. It may take a minute or two.'}</p>
          </div>
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal as="section" className="newsletter">
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
              <span className="newsletter__guide-cover-arabic">بِسْمِ اللَّهِ</span>
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
            <p className="newsletter__error" role="alert">{n.error || 'Something went wrong. Please try again.'}</p>
          )}
        </div>

      </div>
    </Reveal>
  );
}
