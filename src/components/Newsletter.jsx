import { useState } from 'react';
import { subscribeNewsletter } from '../api/client';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

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
          <h2>Subscribe to our newsletter</h2>
          <p>Get Islamic articles and academy updates straight to your inbox.</p>
        </div>
        <form className="newsletter__form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder={
              status === 'done'
                ? '✓ Subscribed! Jazak Allah khair.'
                : 'Enter your email'
            }
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
            {status === 'loading' ? 'Subscribing…' : status === 'done' ? 'Subscribed ✓' : 'Subscribe'}
          </button>
        </form>
        {status === 'error' && (
          <p style={{ color: '#c0392b', marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </section>
  );
}
