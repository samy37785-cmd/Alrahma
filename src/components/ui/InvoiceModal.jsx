import { plans } from '../../data';

const FMT = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

export default function InvoiceModal({ invoice, onClose }) {
  if (!invoice) return null;

  const plan = plans.find((p) => p.name === invoice.plan) || {};
  const discount = ((invoice.originalAmount - invoice.amount)).toFixed(2);
  const dateLabel = FMT.format(new Date(invoice.date));
  const monthLabel = new Date(invoice.date).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__card invoice-detail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Invoice details"
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">×</button>

        {/* Academy header */}
        <div className="inv__header">
          <div className="inv__academy">
            <span className="inv__logo">☪</span>
            <div>
              <strong>AL-Rahma Academy</strong>
              <small>alrahmaacademy038@gmail.com</small>
            </div>
          </div>
          <div className="inv__meta">
            <p><span>Invoice</span> <strong>{invoice.id}</strong></p>
            <p><span>Date</span> <strong>{dateLabel}</strong></p>
            <p><span>Period</span> <strong>{monthLabel}</strong></p>
            <span className={`inv__status inv__status--${invoice.status}`}>
              {invoice.status === 'paid' ? '✓ Paid' : invoice.status}
            </span>
          </div>
        </div>

        <hr className="inv__divider" />

        {/* Plan details */}
        <div className="inv__section">
          <p className="inv__section-title">Subscription — {invoice.plan} Plan</p>
          <ul className="inv__features">
            {(plan.features || []).map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </div>

        <hr className="inv__divider" />

        {/* Price breakdown */}
        <div className="inv__breakdown">
          <div className="inv__row">
            <span>Monthly rate</span>
            <s className="inv__strike">€{invoice.originalAmount.toFixed(2)}</s>
          </div>
          <div className="inv__row inv__row--discount">
            <span>Discount ({invoice.discountPct}% OFF)</span>
            <span className="inv__discount-val">− €{discount}</span>
          </div>
          <div className="inv__row inv__row--total">
            <strong>Total paid</strong>
            <strong>€{invoice.amount.toFixed(2)}</strong>
          </div>
        </div>

        <p className="inv__note">Thank you for learning with Al-Rahma Academy. May Allah bless your journey.</p>

        <button type="button" className="btn btn--ghost btn--block inv__print" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
