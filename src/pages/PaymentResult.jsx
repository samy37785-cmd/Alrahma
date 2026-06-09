import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Brand from '../components/Brand';
import { capturePaypalPayment } from '../api/client';

// Shown after PayPal redirects the buyer back. `cancelled` = the user backed out.
// On success PayPal appends ?token=<orderId>, which we capture to finalize payment.
export default function PaymentResult({ cancelled = false }) {
  const [params] = useSearchParams();
  const orderId = params.get('token');
  const [state, setState] = useState(cancelled ? 'cancelled' : 'capturing'); // capturing | paid | failed | cancelled

  useEffect(() => {
    if (cancelled || !orderId) {
      if (!cancelled) setState('failed');
      return;
    }
    capturePaypalPayment(orderId)
      .then((res) => setState(res.status === 'COMPLETED' ? 'paid' : 'failed'))
      .catch(() => setState('failed'));
  }, [cancelled, orderId]);

  const view = {
    capturing: { icon: '⏳', title: 'Confirming your payment…', sub: 'Please wait a moment.' },
    paid: {
      icon: '✅',
      title: 'Payment Successful!',
      sub: 'Thank you — your subscription is confirmed. We’ll be in touch shortly.',
    },
    failed: {
      icon: '⚠️',
      title: 'Payment could not be confirmed',
      sub: 'If you were charged, please contact us and we’ll sort it out right away.',
    },
    cancelled: {
      icon: '↩️',
      title: 'Payment Cancelled',
      sub: 'No charge was made. You can choose a plan and try again anytime.',
    },
  }[state];

  return (
    <div className="legal">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">← Back to site</Link>
        </div>
      </header>

      <main className="container legal__main payment-result">
        <div className="payment-result__icon">{view.icon}</div>
        <h1>{view.title}</h1>
        <p className="payment-result__sub">{view.sub}</p>
        <Link to="/#pricing" className="btn btn--gold">Back to pricing</Link>
      </main>
    </div>
  );
}
