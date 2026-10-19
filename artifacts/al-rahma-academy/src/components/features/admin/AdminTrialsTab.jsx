import { useState } from 'react';
import { updateTrialStatus } from '../../../api/contentApi';

// "instagram / social / oct_reel" from the request's campaign tags, if any.
const campaignOf = (t) => [t.utm?.source, t.utm?.medium, t.utm?.campaign].filter(Boolean).join(' / ');

// The follow-up stages an admin records by hand. Changing one only updates
// the request: the visitor is never emailed or messaged.
const TRIAL_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'scheduled', label: 'Scheduled' },
];

export default function AdminTrialsTab({ trials, onTrialsChange, onError }) {
  const [trialSearch, setTrialSearch] = useState('');
  const [savingId, setSavingId] = useState(null);

  const changeStatus = async (trial, status) => {
    if (status === trial.status) return;
    setSavingId(trial._id);
    onError?.('');
    try {
      const updated = await updateTrialStatus(trial._id, status);
      onTrialsChange((prev) => prev.map((t) => (t._id === trial._id ? { ...t, ...updated } : t)));
    } catch (err) {
      onError?.(err.response?.status === 403
        ? 'You do not have permission to change a trial request’s status.'
        : (err.response?.data?.message || 'Could not change the status. Nothing was changed.'));
    } finally {
      setSavingId(null);
    }
  };

  const filtered = trials.filter((t) =>
    !trialSearch ||
    t.name?.toLowerCase().includes(trialSearch.toLowerCase()) ||
    t.email?.toLowerCase().includes(trialSearch.toLowerCase()) ||
    t.course?.toLowerCase().includes(trialSearch.toLowerCase())
  );

  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Trial requests ({trials.length})</h2>
        <input
          type="search"
          className="admin__search"
          placeholder="Search by name, email or course…"
          value={trialSearch}
          onChange={(e) => setTrialSearch(e.target.value)}
        />
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Course</th><th>Heard from</th><th>Campaign</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t._id}>
                <td>{t.name}</td>
                <td>{t.email}</td>
                <td>{t.course || '—'}</td>
                <td>{t.heardFrom ? t.heardFrom.replace(/_/g, ' ') : '—'}</td>
                <td>{campaignOf(t) || '—'}</td>
                <td>
                  {onTrialsChange ? (
                    <select
                      aria-label={`Status of ${t.name}'s request`}
                      value={t.status}
                      disabled={savingId === t._id}
                      onChange={(e) => changeStatus(t, e.target.value)}
                    >
                      {TRIAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      {!TRIAL_STATUSES.some((s) => s.value === t.status) && <option value={t.status}>{t.status}</option>}
                    </select>
                  ) : (
                    <span className="admin__badge">{t.status}</span>
                  )}
                </td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {trials.length === 0 && (
              <tr><td colSpan="7" className="admin__empty">No requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
