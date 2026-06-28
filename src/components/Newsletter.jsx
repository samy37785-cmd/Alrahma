import { useState } from 'react';
import { subscribeNewsletter } from '../api/client';
import { useLang } from '../context/LangContext';

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

  return (
    <section className="newsletter">
      <div className="container newsletter__inner">
        <div>
          <h2>{n.heading}</h2>
          <p>{n.sub}</p>
        </div>
        <form className="newsletter__form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder={status === 'done' ? n.success : n.placeholder}
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'loading' || status === 'done'}
            required
          />
          <button
            type="submit"
            className="btn btn--green"
            disabled={status === 'loading' || status === 'done'}
          >
            {status === 'loading' ? n.subscribing : status === 'done' ? n.subscribed : n.btn}
          </button>
        </form>
        {status === 'error' && (
          <p style={{ color: '#c0392b', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            {n.error}
          </p>
        )}
      </div>
    </section>
  );
}
