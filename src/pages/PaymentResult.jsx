import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import { capturePaypalPayment } from '../api/client';
import { useLang } from '../context/LangContext';

export default function PaymentResult({ cancelled = false }) {
  const { t } = useLang();
  const pm = t.authPg.payment;
  const [params] = useSearchParams();
  const orderId = params.get('token');
  const [state, setState] = useState(cancelled ? 'cancelled' : 'capturing');

  useEffect(() => {
    if (cancelled || !orderId) {
      if (!cancelled) setState('failed');
      return;
    }
    capturePaypalPayment(orderId)
      .then((res) => setState(res.status === 'COMPLETED' ? 'paid' : 'failed'))
      .catch(() => setState('failed'));
  }, [cancelled, orderId]);

  const ICONS = { capturing: '⏳', paid: '✅', failed: '⚠️', cancelled: '↩️' };
  const view = pm[state];

  return (
    <div className="legal">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">{pm.backToSite}</Link>
        </div>
      </header>

      <main className="container legal__main payment-result">
        <div className="payment-result__icon">{ICONS[state]}</div>
        <h1>{view.title}</h1>
        <p className="payment-result__sub">{view.sub}</p>
        <Link to="/#pricing" className="btn btn--gold">{pm.backToPricing}</Link>
      </main>
    </div>
  );
}
