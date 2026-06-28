import { useState, useEffect } from 'react';
import { startStripeSession, startPaypalPayment, getManualMethods, submitManualPayment } from '../../api/client';
import { useLang } from '../../context/LangContext';
import { PLAN_TEXT, CHECKOUT_SUBS, pick } from '../../i18n/content';
import { plans } from '../../data';

// Gateway methods (handled via API). `subKey` resolves a translated subtitle from t.checkout.methods.
const GATEWAY_METHODS = [
  { id: 'stripe', group: 'card', label: 'Visa / Mastercard / Apple Pay', subKey: 'cardSub', icon: '💳' },
  { id: 'paypal', group: 'intl', label: 'PayPal',                        subKey: 'intlSub', icon: '🌍' },
];

const amountOf = (price = '') => price.replace(/[^\d.]/g, '');

export default function CheckoutModal({ plan, onClose }) {
  const { t, lang } = useLang();
  const c = t.checkout;
  const subs = pick(CHECKOUT_SUBS, lang);
  const [method, setMethod]         = useState('stripe');
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

  const planIdx     = plans.findIndex((p) => p.name === plan.name);
  const planName    = pick(PLAN_TEXT, lang)[planIdx]?.name || plan.name;
  const amount      = amountOf(plan.price);
  const isGateway   = GATEWAY_METHODS.some((m) => m.id === method);
  const isManual    = !isGateway;
  const manualDef   = manualMethods.find((m) => m.id === method);
  const needsPhone  = false;

  const onField = (key) => (e) => setCustomer((c) => ({ ...c, [key]: e.target.value }));

  const handleGatewaySubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const payload = { plan: plan.name, customer };
      const res = method === 'paypal'
        ? await startPaypalPayment(payload)
        : await startStripeSession(payload);

      if (res.type === 'redirect' && res.url) window.location.href = res.url;
      else throw new Error(c.startFailed);
    } catch (err) {
      setError(err.response?.data?.message || err.message || c.paymentFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await submitManualPayment({ plan: plan.name, method, customer, reference });
      setSuccess(c.successMsg);
    } catch (err) {
      setError(err.response?.data?.message || err.message || c.submitFailed);
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
        aria-label={c.secureCheckout}
      >
        <button className="modal__close" onClick={onClose} aria-label={c.close}>×</button>

        {/* Header */}
        <div className="checkout__head">
          <p className="checkout__lock">{c.secureCheckout}</p>
          <h3 className="modal__title">{planName} {c.planSuffix}</h3>
          <p className="checkout__price">
            {plan.originalPrice && <s className="checkout__orig">{plan.originalPrice}</s>}
            <span>{plan.price}</span> {c.perMonth}
          </p>
          {plan.discountPct && (
            <span className="checkout__discount-pill">{plan.discountPct}{c.offApplied}</span>
          )}
        </div>

        {/* Success state */}
        {success ? (
          <div className="checkout__success">
            <p>{success}</p>
            <button type="button" className="btn btn--green btn--block" onClick={onClose}>{c.close}</button>
          </div>
        ) : iframeUrl ? (
          <div className="checkout__iframe-wrap">
            <iframe title={c.secureCheckout} src={iframeUrl} className="checkout__iframe" />
            <button type="button" className="btn btn--ghost btn--block" onClick={() => setIframeUrl('')}>
              {c.backToOptions}
            </button>
          </div>
        ) : (
          <form onSubmit={isManual ? handleManualSubmit : handleGatewaySubmit}>
            {/* Customer info */}
            <div className="checkout__field">
              <label htmlFor="ck-name">{c.fullName}</label>
              <input id="ck-name" value={customer.name} onChange={onField('name')} required />
            </div>
            <div className="checkout__row">
              <div className="checkout__field">
                <label htmlFor="ck-email">{c.email}</label>
                <input id="ck-email" type="email" value={customer.email} onChange={onField('email')} required />
              </div>
              <div className="checkout__field">
                <label htmlFor="ck-phone">{c.mobile} {needsPhone ? '' : <small>({c.optional})</small>}</label>
                <input
                  id="ck-phone" inputMode="tel" placeholder="01xxxxxxxxx"
                  value={customer.phone} onChange={onField('phone')} required={needsPhone}
                />
              </div>
            </div>

            {/* ── Gateway methods ── */}
            <p className="checkout__group-title">{c.cardPayment}</p>
            {GATEWAY_METHODS.filter((m) => m.group === 'card').map((m) => (
              <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} subs={subs} />
            ))}

            <p className="checkout__group-title">{c.international}</p>
            {GATEWAY_METHODS.filter((m) => m.group === 'intl').map((m) => (
              <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} subs={subs} />
            ))}

            {/* ── Manual / transfer methods ── */}
            {manualMethods.length > 0 && (
              <>
                <p className="checkout__group-title">{c.manualBank}</p>
                <div className="checkout__wallets">
                  {manualMethods.map((m) => (
                    <MethodRow key={m.id} m={m} method={method} setMethod={setMethod} subs={subs} />
                  ))}
                </div>
              </>
            )}

            {/* ── Manual method: show account details + reference field ── */}
            {isManual && manualDef && (
              <div className="checkout__manual-box">
                <p className="checkout__manual-title">{c.transferDetails}</p>
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
                  <label htmlFor="ck-ref">{c.reference}</label>
                  <input
                    id="ck-ref"
                    placeholder={c.refPlaceholder}
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
                ? c.processing
                : isManual
                  ? `${c.submitRequest} — €${amount}`
                  : `${c.completePayment} — €${amount}`}
            </button>
            <p className="checkout__secure-note">
              🔒 {isManual ? c.verifyNote : c.secureNote}
            </p>
            {method === 'stripe' && (
              <p className="checkout__secure-note">
                🔄 {c.recurringNote}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function MethodRow({ m, method, setMethod, subs }) {
  // m.sub = manual-method subtitle (from API); m.subKey = translated gateway subtitle key
  const sub = m.sub || (m.subKey ? subs[m.subKey] : '');
  return (
    <label
      className={`checkout__method ${method === m.id ? 'is-active' : ''}`}
      onClick={() => setMethod(m.id)}
    >
      <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
      <span className="checkout__wallet-icon">{m.icon}</span>
      <span className="checkout__method-label">
        <strong>{m.label}</strong>
        <small>{sub}</small>
      </span>
    </label>
  );
}
