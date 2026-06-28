import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageBar from '../components/layout/PageBar';
import { capturePaypalPayment } from '../api/client';
import { useLang } from '../context/LangContext';

export default function PaymentResult({ cancelled = false }) {
  const { t } = useLang();
  const pm = t.authPg.payment;
  const [params] = useSearchParams();
  const paypalToken = params.get('token');       // PayPal appends ?token=<orderId>
  const stripeSession = params.get('session_id'); // Stripe appends ?session_id=<id>
  const [state, setState] = useState(cancelled ? 'cancelled' : 'capturing');

  useEffect(() => {
    if (cancelled) return;

    // Stripe: the browser only reaches success_url after a completed checkout.
    // Fulfilment (invoice + enrolment) is handled server-side by the webhook.
    if (stripeSession) {
      setState('paid');
      return;
    }

    // PayPal: capture the approved order to finalise the payment.
    if (paypalToken) {
      capturePaypalPayment(paypalToken)
        .then((res) => setState(res.status === 'COMPLETED' ? 'paid' : 'failed'))
        .catch(() => setState('failed'));
      return;
    }

    setState('failed');
  }, [cancelled, paypalToken, stripeSession]);

  const ICONS = { capturing: '⏳', paid: '✅', failed: '⚠️', cancelled: '↩️' };
  const view = pm[state];

  return (
    <div className="legal">
      <PageBar to="/" label={pm.backToSite} />

      <main className="container legal__main payment-result">
        <div className="payment-result__icon">{ICONS[state]}</div>
        <h1>{view.title}</h1>
        <p className="payment-result__sub">{view.sub}</p>
        <Link to="/#pricing" className="btn btn--gold">{pm.backToPricing}</Link>
      </main>
    </div>
  );
}
