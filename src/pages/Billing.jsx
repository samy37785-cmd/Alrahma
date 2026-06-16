import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getInvoices } from '../api/client';
import { sampleInvoices } from '../data';
import InvoiceModal from '../components/ui/InvoiceModal';
import { useLang } from '../context/LangContext';

const LOCALE_MAP = { en: 'en-GB', ar: 'ar-EG', it: 'it-IT', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function toUiInvoice(inv) {
  // Normalize API invoice (snake_case MongoDB doc) to the shape our modal expects.
  return {
    id:             inv.invoiceNumber || inv._id,
    date:           inv.createdAt || inv.date,
    plan:           inv.plan,
    originalAmount: inv.originalAmount,
    amount:         inv.amount,
    discountPct:    inv.discountPct,
    status:         inv.status,
  };
}

export default function Billing() {
  const { lang, t } = useLang();
  const b = t.billing;
  const FMT = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }),
    [lang]
  );
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getInvoices()
      .then((data) => setInvoices(data.length ? data.map(toUiInvoice) : sampleInvoices))
      .catch(() => setInvoices(sampleInvoices))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="billing-page">
      <header className="billing-page__bar">
        <div className="container billing-page__bar-inner">
          <strong>{b.bar}</strong>
          <Link to="/" className="btn btn--ghost btn--sm">{b.backToSite}</Link>
        </div>
      </header>

      <main className="container billing-page__main">
        <div className="billing-page__head">
          <h1>{b.heading}</h1>
          <p className="section-sub">{b.sub}</p>
        </div>

        <div className="billing-page__discount-notice">
          <span>🎉</span>
          <span>{b.discountNotice}</span>
        </div>

        {loading ? (
          <p className="billing-page__hint">{b.loading}</p>
        ) : (
          <>
            <div className="billing-page__table-wrap">
              <table className="billing-page__table">
                <thead>
                  <tr>
                    <th>{b.colInvoice}</th>
                    <th>{b.colDate}</th>
                    <th>{b.colPlan}</th>
                    <th>{b.colOriginal}</th>
                    <th>{b.colDiscount}</th>
                    <th>{b.colPaid}</th>
                    <th>{b.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="billing-page__row"
                      onClick={() => setSelected(inv)}
                      title="Click to view invoice"
                    >
                      <td className="billing-page__id">{inv.id}</td>
                      <td>{FMT.format(new Date(inv.date))}</td>
                      <td>
                        <span className="billing-page__plan-badge">{inv.plan}</span>
                      </td>
                      <td>
                        <s className="billing-page__strike">€{inv.originalAmount}</s>
                      </td>
                      <td className="billing-page__discount-col">−{inv.discountPct}%</td>
                      <td className="billing-page__amount">€{inv.amount}</td>
                      <td>
                        <span className={`billing-page__status billing-page__status--${inv.status}`}>
                          {inv.status === 'paid' ? b.paidStatus : inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan="7" className="billing-page__hint" style={{ textAlign: 'center', padding: '32px' }}>
                        {b.noInvoices}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="billing-page__hint">{b.clickHint}</p>
          </>
        )}
      </main>

      <InvoiceModal invoice={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
