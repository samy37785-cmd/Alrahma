import { useState } from 'react';
import { moderateReview } from '../../../api/reviewApi';

export default function AdminReviewsTab({ reviews, reviewsTotal, onReviewsChange, onError }) {
  const [statusFilter, setStatusFilter] = useState('all');

  const handleModerate = async (id, status) => {
    try {
      const { review } = await moderateReview(id, { status });
      onReviewsChange((prev) => prev.map((r) => (r._id === id ? review : r)));
    } catch (err) {
      onError(err.response?.data?.message || 'Action failed');
    }
  };

  const visible = statusFilter === 'all' ? reviews : reviews.filter((r) => r.status === statusFilter);
  const pendingCount = reviews.filter((r) => r.status === 'pending').length;

  return (
    <section className="admin__panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2>Reviews ({pendingCount} pending / {reviewsTotal} total)</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Student</th><th>Subject</th><th>Rating</th><th>Review</th><th>Status</th><th>Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r._id}>
                <td>{r.student?.name || '—'}</td>
                <td>{r.teacher?.name || r.course?.title || '—'}</td>
                <td>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                <td style={{ maxWidth: 280 }}>{r.title && <strong>{r.title}: </strong>}{r.body}</td>
                <td><span className={`admin__badge admin__badge--${r.status}`}>{r.status}</span></td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td>
                  {r.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn--green btn--sm" onClick={() => handleModerate(r._id, 'approved')}>✓</button>
                      <button className="admin__del" onClick={() => handleModerate(r._id, 'rejected')}>✗</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan="7" className="admin__empty">No reviews to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
