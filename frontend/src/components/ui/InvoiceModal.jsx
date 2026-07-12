import { plans } from '../../data';
import { useLang } from '../../context/LangContext';
import { PLAN_TEXT, INVOICE_TEXT, pick } from '../../i18n/content';
import { useModalA11y } from '../../hooks/useModalA11y';

export default function InvoiceModal({ invoice, onClose }) {
  const { lang } = useLang();
  const v = pick(INVOICE_TEXT, lang);
  const firstFocusRef = useModalA11y(!!invoice, onClose);
  if (!invoice) return null;

  const FMT = new Intl.DateTimeFormat(v.locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const planIdx = plans.findIndex((p) => p.name === invoice.plan);
  const planText = pick(PLAN_TEXT, lang)[planIdx] || {};
  const planName = planText.name || invoice.plan;
  const features = planText.features || (plans[planIdx]?.features) || [];
  const discount = ((invoice.originalAmount - invoice.amount)).toFixed(2);
  const dateLabel = FMT.format(new Date(invoice.date));
  const monthLabel = new Date(invoice.date).toLocaleString(v.locale, { month: 'long', year: 'numeric' });

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__card invoice-detail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={v.invoice}
      >
        <button ref={firstFocusRef} className="modal__close" onClick={onClose} aria-label="Close">×</button>

        {/* Academy header */}
        <div className="inv__header">
          <div className="inv__academy">
            <div>
              <strong>AL-Rahma Academy</strong>
              <small>alrahmaacademy038@gmail.com</small>
            </div>
          </div>
          <div className="inv__meta">
            <p><span>{v.invoice}</span> <strong>{invoice.id}</strong></p>
            <p><span>{v.date}</span> <strong>{dateLabel}</strong></p>
            <p><span>{v.period}</span> <strong>{monthLabel}</strong></p>
            <span className={`inv__status inv__status--${invoice.status}`}>
              {invoice.status === 'paid' ? v.paid : invoice.status}
            </span>
          </div>
        </div>

        <hr className="inv__divider" />

        {/* Plan details */}
        <div className="inv__section">
          <p className="inv__section-title">{v.subscription} — {planName} {v.planWord}</p>
          <ul className="inv__features">
            {features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </div>

        <hr className="inv__divider" />

        {/* Price breakdown */}
        <div className="inv__breakdown">
          <div className="inv__row">
            <span>{v.monthlyRate}</span>
            <s className="inv__strike">€{invoice.originalAmount.toFixed(2)}</s>
          </div>
          <div className="inv__row inv__row--discount">
            <span>{v.discount} ({invoice.discountPct}% {v.off})</span>
            <span className="inv__discount-val">− €{discount}</span>
          </div>
          <div className="inv__row inv__row--total">
            <strong>{v.totalPaid}</strong>
            <strong>€{invoice.amount.toFixed(2)}</strong>
          </div>
        </div>

        <p className="inv__note">{v.thankYou}</p>

        <button type="button" className="btn btn--ghost btn--block inv__print" onClick={() => window.print()}>
          {v.print}
        </button>
      </div>
    </div>
  );
}
