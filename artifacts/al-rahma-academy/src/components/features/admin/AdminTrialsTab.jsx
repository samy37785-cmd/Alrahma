import { useState } from 'react';

// "instagram / social / oct_reel" from the request's campaign tags, if any.
const campaignOf = (t) => [t.utm?.source, t.utm?.medium, t.utm?.campaign].filter(Boolean).join(' / ');

export default function AdminTrialsTab({ trials }) {
  const [trialSearch, setTrialSearch] = useState('');

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
            <tr><th>Name</th><th>Email</th><th>Phone / WhatsApp</th><th>Message</th><th>Course</th><th>Heard from</th><th>Campaign</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t._id}>
                <td>{t.name}</td>
                <td>{t.email}</td>
                <td data-testid="trial-phone">
                  {t.phone ? <span dir="ltr" style={{ whiteSpace: 'nowrap' }}>{t.phone}</span> : <Missing>Not recorded</Missing>}
                </td>
                <td data-testid="trial-message" style={{ whiteSpace: 'pre-wrap', maxWidth: 280, overflowWrap: 'anywhere' }}>
                  {t.message || <Missing>No message</Missing>}
                </td>
                <td>{t.course || '—'}</td>
                <td>{t.heardFrom ? t.heardFrom.replace(/_/g, ' ') : '—'}</td>
                <td>{campaignOf(t) || '—'}</td>
                <td><span className="admin__badge">{t.status}</span></td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {trials.length === 0 && (
              <tr><td colSpan="9" className="admin__empty">No requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 10 }}>
        Phone: until this was fixed, the number typed in the quick trial form and the exit popup was not saved,
        so those older requests show “Not recorded” even if the visitor typed one. Some visitors also sent their
        details over WhatsApp from the success screen. Only the main trial form has a message field.
      </p>
    </section>
  );
}

// A field this request has no value for: shown, not left blank.
function Missing({ children }) {
  return <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{children}</span>;
}
