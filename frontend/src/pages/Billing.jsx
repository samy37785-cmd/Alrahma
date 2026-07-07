import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInvoices } from '../hooks/useBilling';
import InvoiceModal from '../components/ui/InvoiceModal';
import CancelSurvey from '../components/ui/CancelSurvey';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { site } from '../data/site';

const LOCALE_MAP = { en: 'en-GB', ar: 'ar-EG', it: 'it-IT', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const STATUS_CLASS = { paid: 'ds-badge--green', pending: 'ds-badge--yellow', failed: 'ds-badge--red' };

export default function Billing() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const b = t.billing;

  const FMT = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }),
    [lang],
  );

  const { data: invoices = [], isLoading } = useInvoices(!!user);
  const [selected, setSelected] = useState(null);
  const [showCancelSurvey, setShowCancelSurvey] = useState(false);

  const totalPaid = useMemo(
    () => invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0),
    [invoices],
  );
  const latestPlan = invoices.find((i) => i.status === 'paid')?.plan || '—';
  const discount = invoices.find((i) => i.discountPct > 0)?.discountPct;

  return (
    <DashboardLayout>
      {/* Page header */}
      <div className="ds-page-hd">
        <div>
          <div className="ds-page-hd__eyebrow"><span>💳</span> Billing</div>
          <h1 className="ds-page-hd__title">{b.heading}</h1>
          <p className="ds-page-hd__sub">{b.sub}</p>
        </div>
        <Link to="/#pricing" className="btn btn--green btn--sm" style={{ borderRadius: 9, alignSelf: 'flex-start' }}>
          Upgrade Plan
        </Link>
      </div>

      {/* KPI row */}
      <div className="ds-stats" style={{ marginBottom: 20 }}>
        <div className="ds-stat">
          <span className="ds-stat__label">Total Paid</span>
          <span className="ds-stat__value">€{totalPaid.toFixed(2)}</span>
          <span className="ds-stat__icon ds-stat__icon--green">💶</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat__label">Invoices</span>
          <span className="ds-stat__value">{invoices.length}</span>
          <span className="ds-stat__icon ds-stat__icon--blue">📄</span>
        </div>
        <div className="ds-stat">
          <span className="ds-stat__label">Current Plan</span>
          <span className="ds-stat__value" style={{ fontSize: '1rem' }}>{latestPlan}</span>
          <span className="ds-stat__icon ds-stat__icon--gold">⭐</span>
        </div>
        {discount && (
          <div className="ds-stat">
            <span className="ds-stat__label">Best Discount</span>
            <span className="ds-stat__value">{discount}%</span>
            <span className="ds-stat__icon ds-stat__icon--purple">🎉</span>
          </div>
        )}
      </div>

      {/* Discount banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
        background: 'var(--color-gold-surface, #fef9ee)', border: '1px solid var(--color-gold-border, #f0d98a)',
        borderRadius: 10, marginBottom: 18, fontSize: '0.84rem', color: 'var(--color-gold-text, #92620a)',
      }}>
        <span>🎉</span><span>{b.discountNotice}</span>
      </div>

      {/* Invoice table card */}
      <div className="ds-card">
        <div className="ds-card__hd">
          <span className="ds-card__title"><span className="ds-card__title-icon">🧾</span> {b.colInvoice}s</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{b.clickHint}</span>
        </div>
        <div className="ds-card__body" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div className="ds-skel" style={{ width: '60%', height: 16, margin: '0 auto 10px' }} />
              <div className="ds-skel" style={{ width: '40%', height: 14, margin: '0 auto' }} />
            </div>
          ) : (
            <div className="ds-table-wrap">
              <table className="ds-table">
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
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '40px 24px' }}>
                        <div className="ds-empty">
                          <div className="ds-empty__icon">🧾</div>
                          <div className="ds-empty__title">{b.noInvoices}</div>
                          <div className="ds-empty__desc">Your invoices will appear here once you have an active subscription.</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(inv)}
                        title="Click to view invoice"
                      >
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{inv.id}</td>
                        <td>{FMT.format(new Date(inv.date))}</td>
                        <td>
                          <span className="ds-badge ds-badge--gold">{inv.plan}</span>
                        </td>
                        <td>
                          <s style={{ color: 'var(--text-disabled)', fontSize: '0.85rem' }}>€{inv.originalAmount}</s>
                        </td>
                        <td style={{ color: 'var(--color-success-text)', fontWeight: 700, fontSize: '0.85rem' }}>
                          {inv.discountPct > 0 ? `−${inv.discountPct}%` : '—'}
                        </td>
                        <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>€{inv.amount}</td>
                        <td>
                          <span className={`ds-badge ${STATUS_CLASS[inv.status] || 'ds-badge--gray'}`}>
                            {inv.status === 'paid' ? b.paidStatus : inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cancel subscription row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', marginTop: 16,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 10, fontSize: '0.84rem',
      }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Cancel subscription</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            You keep access until end of billing period. 14-day refund available if in first period.{' '}
            <Link to="/academy/refund-policy" style={{ color: 'var(--color-primary)' }}>Refund policy →</Link>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          style={{ flexShrink: 0, marginLeft: 16, background: 'none', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', borderRadius: 8 }}
          onClick={() => setShowCancelSurvey(true)}
        >
          Cancel plan
        </button>
      </div>

      <InvoiceModal invoice={selected} onClose={() => setSelected(null)} />

      {showCancelSurvey && (
        <CancelSurvey
          onClose={() => setShowCancelSurvey(false)}
          onConfirmCancel={() => {
            setShowCancelSurvey(false);
            window.location.href = `mailto:${site.email}?subject=Cancel%20Subscription&body=Please%20cancel%20my%20subscription.%20Account%3A%20${user?.email || ''}`;
          }}
        />
      )}
    </DashboardLayout>
  );
}
