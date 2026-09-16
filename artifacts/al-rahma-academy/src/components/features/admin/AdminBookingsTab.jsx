import { useState, Fragment } from 'react';
import { updateEnrollment, approveEnrollment } from '../../../api/enrollmentApi';
import { useLang } from '../../../context/LangContext';

// Scope correction (see docs/current-project-status.md): only online CARD
// payment is cancelled — this tab itself still sends no price/card/gateway
// field, ever (status + adminNote only; utils/enrollmentValidation.js
// enforces the same allowlist server-side). "Approve & Activate" is the one
// action that does have a financial-adjacent effect: it links the booking
// to the student's account, activates their subscription, and (server-side)
// generates an invoice record — none of that happens through a card gateway
// or any field this component sends.
//
// Fully localized (t.adminBookings, all 6 languages) — unlike its sibling
// admin tabs (AdminUsersTab, ...), which predate this feature and remain
// English-only by established convention; this tab was explicitly required
// to be localized, so it uses useLang() directly.
const STATUS_VALUES = ['pending', 'approved', 'enrolled', 'cancelled'];

const EMPTY_DRAFT = { adminNote: '' };

export default function AdminBookingsTab({ bookings, bookingsTotal, onBookingsChange, onError }) {
  const { t, lang } = useLang();
  const b = t.adminBookings;
  // Historical bookings may still carry a retired status value
  // ('contacted'/'awaiting_payment'/'paid') from before this decision — the
  // backend never deletes that data (models/Enrollment.js), and this label
  // map still displays it correctly; only the four canonical values below
  // can be newly selected.
  const STATUS_LABEL = {
    pending: b.statusPending,
    approved: b.statusApproved,
    contacted: b.statusContacted,
    awaiting_payment: b.statusAwaitingPayment,
    paid: b.statusPaid,
    enrolled: b.statusEnrolled,
    cancelled: b.statusCancelled,
  };

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

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

  // Scope correction (see docs/current-project-status.md): the one admin
  // action that links a booking to its registered account and activates
  // their subscription/content access, end to end (see backend's
  // controllers/enrollmentController.js's approveEnrollment).
  const handleApprove = async (id) => {
    setApprovingId(id);
    try {
      const result = await approveEnrollment(id);
      applyLocalUpdate(id, result.enrollment);
    } catch (err) {
      onError(err.response?.data?.message || b.errorApprove);
    } finally {
      setApprovingId(null);
    }
  };

  const startEdit = (bk) => {
    setEditingId(bk._id);
    setDraft({ adminNote: bk.adminNote || '' });
  };

  const cancelEdit = () => { setEditingId(null); setDraft(EMPTY_DRAFT); };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      const updated = await updateEnrollment(id, { adminNote: draft.adminNote });
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
              <th>{b.colStatus}</th><th>{b.colDate}</th><th>{b.colDetails}</th>
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
                      {!STATUS_VALUES.includes(bk.status) && (
                        <option value={bk.status}>{STATUS_LABEL[bk.status] || bk.status}</option>
                      )}
                      {STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(bk.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(bk.status === 'pending' || bk.status === 'approved') && (
                        <button
                          type="button"
                          className="btn btn--green btn--sm"
                          disabled={approvingId === bk._id}
                          onClick={() => handleApprove(bk._id)}
                        >
                          {approvingId === bk._id ? b.approving : b.approveActivate}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => (editingId === bk._id ? cancelEdit() : startEdit(bk))}
                      >
                        {editingId === bk._id ? b.close : b.edit}
                      </button>
                    </div>
                  </td>
                </tr>
                {editingId === bk._id && (
                  <tr>
                    <td colSpan={7}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '12px 4px' }}>
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
              <tr><td colSpan={7} className="admin__empty">{b.emptyState}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
