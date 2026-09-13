import { useState, Fragment } from 'react';
import { updateEnrollment } from '../../../api/enrollmentApi';
import { useLang } from '../../../context/LangContext';

// Booking-First Enrollment admin tracker — this is administrative
// bookkeeping only (agreed amount, currency, external payment method,
// paid/renewal dates, reference note), never a payment gateway; no card or
// account data is collected or stored here. Payment happens off-site over
// WhatsApp; actual subscription activation for a student's account is done
// from the Users tab's existing "Activate"/"+30d" controls.
//
// Fully localized (t.adminBookings, all 6 languages) — unlike its sibling
// admin tabs (AdminPaymentsTab, AdminUsersTab, ...), which predate this
// feature and remain English-only by established convention; this tab was
// explicitly required to be localized, so it uses useLang() directly.
const STATUS_VALUES = ['pending', 'contacted', 'awaiting_payment', 'paid', 'enrolled', 'cancelled'];

const EMPTY_FINANCIALS = { agreedAmount: '', currency: '', paymentMethodExternal: '', paidAt: '', renewalAt: '', adminNote: '' };

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export default function AdminBookingsTab({ bookings, bookingsTotal, onBookingsChange, onError }) {
  const { t, lang } = useLang();
  const b = t.adminBookings;
  const STATUS_LABEL = {
    pending: b.statusPending,
    contacted: b.statusContacted,
    awaiting_payment: b.statusAwaitingPayment,
    paid: b.statusPaid,
    enrolled: b.statusEnrolled,
    cancelled: b.statusCancelled,
  };

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_FINANCIALS);
  const [saving, setSaving] = useState(false);

  const filtered = bookings.filter((bk) =>
    !search ||
    bk.name?.toLowerCase().includes(search.toLowerCase()) ||
    bk.email?.toLowerCase().includes(search.toLowerCase()) ||
    bk.bookingRef?.toLowerCase().includes(search.toLowerCase())
  );

  const applyLocalUpdate = (id, patch) => {
    onBookingsChange((prev) => prev.map((bk) => (bk._id === id ? { ...bk, ...patch } : bk)));
  };

  const handleStatusChange = async (id, status) => {
    try {
      const updated = await updateEnrollment(id, { status });
      applyLocalUpdate(id, updated);
    } catch (err) {
      onError(err.response?.data?.message || b.errorStatusUpdate);
    }
  };

  const startEdit = (bk) => {
    setEditingId(bk._id);
    setDraft({
      agreedAmount: bk.agreedAmount ?? '',
      currency: bk.currency || '',
      paymentMethodExternal: bk.paymentMethodExternal || '',
      paidAt: toDateInput(bk.paidAt),
      renewalAt: toDateInput(bk.renewalAt),
      adminNote: bk.adminNote || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setDraft(EMPTY_FINANCIALS); };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const patch = {
        agreedAmount: draft.agreedAmount === '' ? undefined : Number(draft.agreedAmount),
        currency: draft.currency || undefined,
        paymentMethodExternal: draft.paymentMethodExternal || undefined,
        paidAt: draft.paidAt || undefined,
        renewalAt: draft.renewalAt || undefined,
        adminNote: draft.adminNote,
      };
      const updated = await updateEnrollment(id, patch);
      applyLocalUpdate(id, updated);
      cancelEdit();
    } catch (err) {
      onError(err.response?.data?.message || b.errorSaveDetails);
    } finally {
      setSaving(false);
    }
  };

  const title = (b.title || '')
    .replace('{new}', bookings.filter((bk) => bk.status === 'pending').length)
    .replace('{total}', bookingsTotal);

  return (
    <section className="admin__panel" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="admin__panel-head">
        <h2>{title}</h2>
        <input
          type="search"
          className="admin__search"
          placeholder={b.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>{b.colBookingRef}</th><th>{b.colName}</th><th>{b.colWhatsapp}</th><th>{b.colPlan}</th>
              <th>{b.colStatus}</th><th>{b.colAmount}</th><th>{b.colDate}</th><th>{b.colDetails}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((bk) => (
              <Fragment key={bk._id}>
                <tr>
                  <td style={{ fontFamily: 'monospace', fontSize: '.82rem' }}>{bk.bookingRef || '—'}</td>
                  <td>{bk.name}</td>
                  <td>{bk.whatsapp || '—'}</td>
                  <td>{bk.plan || '—'}</td>
                  <td>
                    <select
                      className="admin__badge"
                      value={bk.status}
                      onChange={(e) => handleStatusChange(bk._id, e.target.value)}
                    >
                      {STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{bk.agreedAmount ? `${bk.currency || ''} ${bk.agreedAmount}` : '—'}</td>
                  <td>{new Date(bk.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => (editingId === bk._id ? cancelEdit() : startEdit(bk))}
                    >
                      {editingId === bk._id ? b.close : b.edit}
                    </button>
                  </td>
                </tr>
                {editingId === bk._id && (
                  <tr>
                    <td colSpan={8}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '12px 4px' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '.78rem', gap: 4 }}>
                          {b.fieldAgreedAmount}
                          <input
                            type="number" min="0" step="0.01"
                            value={draft.agreedAmount}
                            onChange={(e) => setDraft((d) => ({ ...d, agreedAmount: e.target.value }))}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '.78rem', gap: 4 }}>
                          {b.fieldCurrency}
                          <input
                            type="text" placeholder="EUR"
                            value={draft.currency}
                            onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '.78rem', gap: 4 }}>
                          {b.fieldPaymentMethod}
                          <input
                            type="text" placeholder={b.placeholderPaymentMethod}
                            value={draft.paymentMethodExternal}
                            onChange={(e) => setDraft((d) => ({ ...d, paymentMethodExternal: e.target.value }))}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '.78rem', gap: 4 }}>
                          {b.fieldPaidOn}
                          <input
                            type="date"
                            value={draft.paidAt}
                            onChange={(e) => setDraft((d) => ({ ...d, paidAt: e.target.value }))}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '.78rem', gap: 4 }}>
                          {b.fieldRenewsOn}
                          <input
                            type="date"
                            value={draft.renewalAt}
                            onChange={(e) => setDraft((d) => ({ ...d, renewalAt: e.target.value }))}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '.78rem', gap: 4, flex: '1 1 220px' }}>
                          {b.fieldAdminNote}
                          <input
                            type="text" placeholder={b.placeholderAdminNote}
                            value={draft.adminNote}
                            onChange={(e) => setDraft((d) => ({ ...d, adminNote: e.target.value }))}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn--green btn--sm"
                          style={{ alignSelf: 'flex-end' }}
                          disabled={saving}
                          onClick={() => saveEdit(bk._id)}
                        >
                          {saving ? b.saving : b.save}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="admin__empty">{b.emptyState}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
