import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getInvoices } from '../api/client';
import { sampleInvoices, plans } from '../data';
import InvoiceModal from '../components/InvoiceModal';

const FMT = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });

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
          <strong>AL-Rahma · Billing</strong>
          <Link to="/" className="btn btn--ghost btn--sm">← Back to site</Link>
        </div>
      </header>

      <main className="container billing-page__main">
        <div className="billing-page__head">
          <h1>Invoices &amp; Billing</h1>
          <p className="section-sub">All your monthly invoices — click any row to see full details.</p>
        </div>

        <div className="billing-page__discount-notice">
          <span>🎉</span>
          <span>A <strong>25% discount</strong> is applied to all your invoices. Original prices shown with strikethrough.</span>
        </div>

        {loading ? (
          <p className="billing-page__hint">Loading invoices…</p>
        ) : (
          <>
            <div className="billing-page__table-wrap">
              <table className="billing-page__table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Original</th>
                    <th>Discount</th>
                    <th>Paid</th>
                    <th>Status</th>
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
                          {inv.status === 'paid' ? '✓ Paid' : inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan="7" className="billing-page__hint" style={{ textAlign: 'center', padding: '32px' }}>
                        No invoices yet. Complete a payment to see your billing history here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="billing-page__hint">Click any invoice row to open a printable invoice with full details.</p>
          </>
        )}
      </main>

      <InvoiceModal invoice={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
