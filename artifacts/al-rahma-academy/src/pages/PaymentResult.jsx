import { Link } from 'react-router-dom';
import PageBar from '../components/layout/PageBar';
import { useLang } from '../context/LangContext';

// Booking-First Enrollment: this project no longer runs in-app checkout, so
// /payment/success and /payment/cancel (old Stripe/PayPal redirect targets)
// no longer capture or finalise anything. The routes stay mounted — old
// shared/bookmarked links must not 404 — but now show a clear message and a
// safe path back into the booking flow instead of any payment UI.
export default function PaymentResult() {
  const { t } = useLang();
  const pm = t.authPg.paymentDeprecated;

  return (
    <div className="legal">
      <PageBar to="/" label={pm.backToSite} />

      <main className="container legal__main payment-result">
        <div className="payment-result__icon">ℹ️</div>
        <h1>{pm.title}</h1>
        <p className="payment-result__sub">{pm.sub}</p>
        <Link to="/enroll" className="btn btn--gold">{pm.cta}</Link>
      </main>
    </div>
  );
}
