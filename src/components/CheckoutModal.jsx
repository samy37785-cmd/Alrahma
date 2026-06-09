import { useState } from 'react';
import { startPaymobPayment, startPaypalPayment } from '../api/client';

// Secure checkout modal. `plan` = the selected plan object (with name + price)
// or null (hidden). `onClose` closes the modal.
//
// IMPORTANT (PCI): we never collect raw card numbers ourselves. For card
// payments we open PayMob's secure iframe (it handles the card form). For
// wallets / PayPal we redirect to the gateway. We only collect billing info.

const METHODS = [
  { id: 'card', group: 'card', label: 'Visa / Mastercard', sub: 'Secure card payment', icon: '💳' },
  { id: 'vodafone', group: 'wallet', label: 'Vodafone Cash', sub: 'المحافظ الإلكترونية', icon: '📱' },
  { id: 'fawry', group: 'wallet', label: 'Fawry', sub: 'فوري', icon: '🏪' },
  { id: 'instapay', group: 'wallet', label: 'InstaPay', sub: 'إنستا باي', icon: '⚡' },
  { id: 'paypal', group: 'intl', label: 'PayPal', sub: 'For international students', icon: '🌍' },
];

const amountOf = (price = '') => price.replace(/[^\d.]/g, '');

export default function CheckoutModal({ plan, onClose }) {
  const [method, setMethod] = useState('card');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [iframeUrl, setIframeUrl] = useState(''); // PayMob card iframe, shown inline

  if (!plan) return null;

  const amount = amountOf(plan.price);
  const needsPhone = method !== 'card' && method !== 'paypal';
  const onField = (key) => (e) => setCustomer((c) => ({ ...c, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { plan: plan.name, method, customer };
      const res =
        method === 'paypal'
          ? await startPaypalPayment(payload)
          : await startPaymobPayment(payload);

      if (res.type === 'iframe') {
        // Card: render PayMob's secure form inside the modal.
        setIframeUrl(res.url);
      } else if (res.type === 'redirect' && res.url) {
        // Wallet / PayPal: hand off to the gateway.
        window.location.href = res.url;
      } else {
        throw new Error('Could not start the payment. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__card checkout"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Secure checkout"
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">×</button>

        {/* Header: plan name + price */}
        <div className="checkout__head">
          <p className="checkout__lock">🔒 Secure Checkout</p>
          <h3 className="modal__title">{plan.name} Plan</h3>
          <p className="checkout__price">
            <span>{plan.price}</span> / month
          </p>
        </div>

        {/* Card payment: once we have the iframe URL, show PayMob's secure form */}
        {iframeUrl ? (
          <div className="checkout__iframe-wrap">
            <iframe title="Secure card payment" src={iframeUrl} className="checkout__iframe" />
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => setIframeUrl('')}
            >
              ← Back to payment options
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Billing info (PayMob/PayPal require name + email; wallets need phone) */}
            <div className="checkout__field">
              <label htmlFor="ck-name">Full Name</label>
              <input id="ck-name" value={customer.name} onChange={onField('name')} required />
            </div>
            <div className="checkout__row">
              <div className="checkout__field">
                <label htmlFor="ck-email">Email</label>
                <input
                  id="ck-email"
                  type="email"
                  value={customer.email}
                  onChange={onField('email')}
                  required
                />
              </div>
              <div className="checkout__field">
                <label htmlFor="ck-phone">
                  Mobile {needsPhone ? '' : <small>(optional)</small>}
                </label>
                <input
                  id="ck-phone"
                  inputMode="tel"
                  placeholder="01xxxxxxxxx"
                  value={customer.phone}
                  onChange={onField('phone')}
                  required={needsPhone}
                />
              </div>
            </div>

            {/* ===== Group 1: Cards ===== */}
            <p className="checkout__group-title">Credit / Debit Card</p>
            {METHODS.filter((m) => m.group === 'card').map((m) => (
              <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
            ))}

            {/* ===== Group 2: Digital wallets & instant pay ===== */}
            <p className="checkout__group-title">Digital Wallets &amp; Instant Pay</p>
            <div className="checkout__wallets">
              {METHODS.filter((m) => m.group === 'wallet').map((m) => (
                <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
              ))}
            </div>

            {/* ===== Group 3: International ===== */}
            <p className="checkout__group-title">International</p>
            {METHODS.filter((m) => m.group === 'intl').map((m) => (
              <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
            ))}

            {error && <p className="checkout__error">{error}</p>}

            <button
              type="submit"
              className="btn btn--gold btn--block checkout__submit"
              disabled={loading}
            >
              {loading ? 'Processing…' : `Complete Payment — €${amount} / إتمام الدفع`}
            </button>
            <p className="checkout__secure-note">
              🔒 Card details are entered on the gateway's secure page. Cancel anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// A single selectable payment-method row.
function MethodRow({ m, method, setMethod }) {
  return (
    <label
      className={`checkout__method ${method === m.id ? 'is-active' : ''}`}
      onClick={() => setMethod(m.id)}
    >
      <input
        type="radio"
        name="method"
        checked={method === m.id}
        onChange={() => setMethod(m.id)}
      />
      <span className="checkout__wallet-icon">{m.icon}</span>
      <span className="checkout__method-label">
        <strong>{m.label}</strong>
        <small>{m.sub}</small>
      </span>
    </label>
  );
}
