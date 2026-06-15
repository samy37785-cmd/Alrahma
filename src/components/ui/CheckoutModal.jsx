import { useState, useEffect } from 'react';
import { startPaymobPayment, startPaypalPayment, getManualMethods, submitManualPayment } from '../../api/client';

// Gateway methods (handled via API)
const GATEWAY_METHODS = [
  { id: 'card',      group: 'card',   label: 'Visa / Mastercard', sub: 'Secure card payment',   icon: '💳' },
  { id: 'vodafone',  group: 'wallet', label: 'Vodafone Cash',     sub: 'المحافظ الإلكترونية',   icon: '📱' },
  { id: 'fawry',     group: 'wallet', label: 'Fawry',             sub: 'فوري',                  icon: '🏪' },
  { id: 'instapay',  group: 'wallet', label: 'InstaPay',          sub: 'إنستا باي',             icon: '⚡' },
  { id: 'paypal',    group: 'intl',   label: 'PayPal',            sub: 'For international students', icon: '🌍' },
];

const amountOf = (price = '') => price.replace(/[^\d.]/g, '');

export default function CheckoutModal({ plan, onClose }) {
  const [method, setMethod]         = useState('card');
  const [manualMethods, setManual]  = useState([]);
  const [customer, setCustomer]     = useState({ name: '', email: '', phone: '' });
  const [reference, setReference]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [iframeUrl, setIframeUrl]   = useState('');
  const [success, setSuccess]       = useState('');

  useEffect(() => {
    if (!plan) return;
    getManualMethods().then(setManual).catch(() => {});
  }, [plan]);

  if (!plan) return null;

  const amount      = amountOf(plan.price);
  const isGateway   = GATEWAY_METHODS.some((m) => m.id === method);
  const isManual    = !isGateway;
  const manualDef   = manualMethods.find((m) => m.id === method);
  const needsPhone  = method === 'vodafone';

  const onField = (key) => (e) => setCustomer((c) => ({ ...c, [key]: e.target.value }));

  const handleGatewaySubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const payload = { plan: plan.name, method, customer };
      const res = method === 'paypal'
        ? await startPaypalPayment(payload)
        : await startPaymobPayment(payload);

      if (res.type === 'iframe')    setIframeUrl(res.url);
      else if (res.type === 'redirect' && res.url) window.location.href = res.url;
      else throw new Error('Could not start the payment. Please try again.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await submitManualPayment({ plan: plan.name, method, customer, reference });
      setSuccess('✅ Payment request received! We will verify and activate your plan within 24 hours. Check your email for confirmation.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Submission failed.');
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

        {/* Header */}
        <div className="checkout__head">
          <p className="checkout__lock">🔒 Secure Checkout</p>
          <h3 className="modal__title">{plan.name} Plan</h3>
          <p className="checkout__price">
            {plan.originalPrice && <s className="checkout__orig">{plan.originalPrice}</s>}
            <span>{plan.price}</span> / month
          </p>
          {plan.discountPct && (
            <span className="checkout__discount-pill">{plan.discountPct}% OFF applied</span>
          )}
        </div>

        {/* Success state */}
        {success ? (
          <div className="checkout__success">
            <p>{success}</p>
            <button type="button" className="btn btn--green btn--block" onClick={onClose}>Close</button>
          </div>
        ) : iframeUrl ? (
          <div className="checkout__iframe-wrap">
            <iframe title="Secure card payment" src={iframeUrl} className="checkout__iframe" />
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setIframeUrl('')}>
              ← Back to payment options
            </button>
          </div>
        ) : (
          <form onSubmit={isManual ? handleManualSubmit : handleGatewaySubmit}>
            {/* Customer info */}
            <div className="checkout__field">
              <label htmlFor="ck-name">Full Name</label>
              <input id="ck-name" value={customer.name} onChange={onField('name')} required />
            </div>
            <div className="checkout__row">
              <div className="checkout__field">
                <label htmlFor="ck-email">Email</label>
                <input id="ck-email" type="email" value={customer.email} onChange={onField('email')} required />
              </div>
              <div className="checkout__field">
                <label htmlFor="ck-phone">Mobile {needsPhone ? '' : <small>(optional)</small>}</label>
                <input
                  id="ck-phone" inputMode="tel" placeholder="01xxxxxxxxx"
                  value={customer.phone} onChange={onField('phone')} required={needsPhone}
                />
              </div>
            </div>

            {/* ── Gateway methods ── */}
            <p className="checkout__group-title">💳 Card Payment</p>
            {GATEWAY_METHODS.filter((m) => m.group === 'card').map((m) => (
              <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
            ))}

            <p className="checkout__group-title">📱 Digital Wallets</p>
            <div className="checkout__wallets">
              {GATEWAY_METHODS.filter((m) => m.group === 'wallet').map((m) => (
                <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
              ))}
            </div>

            <p className="checkout__group-title">🌍 International — Online</p>
            {GATEWAY_METHODS.filter((m) => m.group === 'intl').map((m) => (
              <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
            ))}

            {/* ── Manual / transfer methods ── */}
            {manualMethods.length > 0 && (
              <>
                <p className="checkout__group-title">🏦 Manual Bank &amp; Transfer</p>
                <div className="checkout__wallets">
                  {manualMethods.map((m) => (
                    <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} />
                  ))}
                </div>
              </>
            )}

            {/* ── Manual method: show account details + reference field ── */}
            {isManual && manualDef && (
              <div className="checkout__manual-box">
                <p className="checkout__manual-title">Transfer details</p>
                <ul className="checkout__manual-fields">
                  {manualDef.fields.filter((f) => f.value).map((f) => (
                    <li key={f.label}>
                      <span>{f.label}</span>
                      <strong>{f.value}</strong>
                    </li>
                  ))}
                </ul>
                <p className="checkout__manual-instr">{manualDef.instructions}</p>
                <div className="checkout__field" style={{ marginTop: 12 }}>
                  <label htmlFor="ck-ref">Reference / Confirmation Number</label>
                  <input
                    id="ck-ref"
                    placeholder="e.g. MTCN, transaction ID, transfer ref…"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {error && <p className="checkout__error">{error}</p>}

            <button
              type="submit"
              className="btn btn--gold btn--block checkout__submit"
              disabled={loading}
            >
              {loading
                ? 'Processing…'
                : isManual
                  ? `Submit Payment Request — €${amount}`
                  : `Complete Payment — €${amount}`}
            </button>
            <p className="checkout__secure-note">
              🔒 {isManual
                ? 'We will verify your transfer within 24 hours and activate your plan.'
                : 'Card details are entered on the gateway\'s secure page. Cancel anytime.'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function MethodRow({ m, method, setMethod }) {
  return (
    <label
      className={`checkout__method ${method === m.id ? 'is-active' : ''}`}
      onClick={() => setMethod(m.id)}
    >
      <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
      <span className="checkout__wallet-icon">{m.icon}</span>
      <span className="checkout__method-label">
        <strong>{m.label}</strong>
        <small>{m.sub}</small>
      </span>
    </label>
  );
}
