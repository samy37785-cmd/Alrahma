import { useState } from 'react';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) return;
    console.log('Newsletter signup:', email);
    setEmail('');
    setSubscribed(true);
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
            placeholder={subscribed ? '✓ Subscribed! Jazak Allah khair.' : 'Enter your email'}
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn btn--green">
            Subscribe
          </button>
        </form>
      </div>
    </section>
  );
}
