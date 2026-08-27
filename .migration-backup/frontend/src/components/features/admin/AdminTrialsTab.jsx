import { useState } from 'react';

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
            <tr><th>Name</th><th>Email</th><th>Course</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t._id}>
                <td>{t.name}</td>
                <td>{t.email}</td>
                <td>{t.course || '—'}</td>
                <td><span className="admin__badge">{t.status}</span></td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {trials.length === 0 && (
              <tr><td colSpan="5" className="admin__empty">No requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
