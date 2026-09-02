import { useState } from 'react';
import Reveal from '../../ui/Reveal';
import { subscribeNewsletter } from '../../../api/contentApi';
import { useLang } from '../../../context/LangContext';

// Trust/marketing remediation: this list used to promise a "12-page
// illustrated Tajweed guide (PDF)", "5 audio pronunciation examples" and a
// "30-day beginner memorisation plan". subscribeNewsletter() only posts an
// email address to /newsletter (src/api/contentApi.js) — there is no
// tracked evidence anywhere in this frontend of a PDF asset, an audio
// asset, a delivery workflow, or a download link that would fulfil those
// specific promises. Rather than translate an unverifiable promise into
// six languages, the benefit copy below describes the newsletter itself
// (content, not a specific document's page/file count) — see
// docs/trust-marketing-remediation.md.
const BENEFIT_ICONS = [
  <svg key="tips" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z"/>
    <path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8Z"/>
  </svg>,
  <svg key="pronunciation" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/>
    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3Z"/>
  </svg>,
  <svg key="habit" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>,
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
            <h2>{n.successHeading}</h2>
            <p>{n.successSub}</p>
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
            {n.badge}
          </span>
          <h2 className="newsletter__offer-title">
            {n.heading}
          </h2>
          <p className="newsletter__offer-sub">
            {n.sub}
          </p>
          <ul className="newsletter__benefits">
            {n.benefits.map((text, i) => (
              <li key={text} className="newsletter__benefit">
                <span className="newsletter__benefit-icon">{BENEFIT_ICONS[i]}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — form.
            Trust/marketing remediation: the "book cover" mockup that used
            to sit here (hardcoded, untranslated "Tajweed Starter Guide" /
            "FREE" text on a book-shaped graphic) implied a specific
            physical/PDF document that isn't evidenced anywhere in this
            frontend — see the note above BENEFIT_ICONS. It was removed
            rather than translated, since translating it would present the
            same unverified promise in six languages instead of one. */}
        <div className="newsletter__form-wrap">
          <form className="newsletter__form" onSubmit={handleSubmit}>
            <input
              type="email"
              className="newsletter__input"
              placeholder={n.placeholder}
              aria-label={n.emailAriaLabel}
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
              {status === 'loading' ? n.subscribing : n.btn}
            </button>
            <p className="newsletter__privacy">
              {n.privacy}
            </p>
          </form>
          {status === 'error' && (
            <p className="newsletter__error" role="alert">{n.error}</p>
          )}
        </div>

      </div>
    </Reveal>
  );
}
