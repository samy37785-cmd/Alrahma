import { reviewManualPayment } from '../../../api/client';

export default function AdminPaymentsTab({ manualPays, manualPaysTotal, onManualPaysChange, onError }) {
  const handleReview = async (id, status) => {
    try {
      const updated = await reviewManualPayment(id, { status });
      onManualPaysChange((prev) => prev.map((p) => (p._id === id ? updated : p)));
    } catch (err) {
      onError(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <section className="admin__panel">
      <h2>Manual Payments ({manualPays.filter((p) => p.status === 'pending').length} pending / {manualPaysTotal} total)</h2>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Plan</th><th>Method</th><th>Amount</th><th>Reference</th><th>Status</th><th>Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            {manualPays.map((p) => (
              <tr key={p._id}>
                <td>{p.customer?.name || '—'}</td>
                <td>{p.customer?.email || '—'}</td>
                <td>{p.plan}</td>
                <td><span className="admin__badge">{p.method}</span></td>
                <td>€{p.amount}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '.82rem' }}>{p.reference || '—'}</td>
                <td><span className={`admin__badge admin__badge--${p.status}`}>{p.status}</span></td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td>
                  {p.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn--green btn--sm" onClick={() => handleReview(p._id, 'approved')}>✓</button>
                      <button className="admin__del" onClick={() => handleReview(p._id, 'rejected')}>✗</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {manualPays.length === 0 && (
              <tr><td colSpan="9" className="admin__empty">No manual payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
