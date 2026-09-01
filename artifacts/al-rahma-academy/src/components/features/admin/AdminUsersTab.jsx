import { useState } from 'react';
import { updateUserSubscription } from '../../../api/adminApi';

// Stage 2C Final Corrective (see docs/user-admin-auth-contract.md): this
// table used to show a "Role" column (the raw, untrusted backend `role`
// field - could still literally read "student"/"teacher"/"parent" for an
// old account) and a "Family" column (a free-text field gated on
// `u.role === 'student'`, with zero documentation anywhere and zero other
// consumer that ever read it back - an orphan of the deleted parent/
// student account model, not a real general-purpose product field). Both
// are removed entirely, along with setFamilyName (now zero-consumer,
// deleted from api/adminApi.js). Every row in this table is, by
// definition, a regular user account - GET /v1/admin/users never returns
// an AdminUser, which is an entirely separate system (AdminAuthContext) -
// so there is nothing left for a role-ish column to meaningfully show.
export default function AdminUsersTab({ users, usersTotal, onOpenReport, onUsersChange, onError }) {
  const [userSearch, setUserSearch] = useState('');

  const handleSubscription = async (userId, action, plan) => {
    try {
      const updated = await updateUserSubscription(userId, { action, plan });
      onUsersChange((prev) => prev.map((u) => u._id === userId ? { ...u, subscription: updated.subscription } : u));
    } catch (err) {
      onError(err.response?.data?.message || 'Action failed');
    }
  };

  const filtered = users.filter((u) =>
    !userSearch ||
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Registered Users ({usersTotal})</h2>
        <input
          type="search"
          className="admin__search"
          placeholder="Search by name or email…"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>#</th><th>Name</th><th>Email</th><th>Plan</th><th>Status</th><th>Valid Until</th><th>Action</th></tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u._id}>
                <td>{i + 1}</td>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.subscription?.plan || '—'}</td>
                <td>
                  <span className={`admin__badge admin__badge--${u.subscription?.status === 'active' ? 'approved' : 'rejected'}`}>
                    {u.subscription?.status || 'inactive'}
                  </span>
                </td>
                <td>{u.subscription?.validUntil ? new Date(u.subscription.validUntil).toLocaleDateString() : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn btn--ghost btn--sm" title="View progress report" onClick={() => onOpenReport(u)}>📊</button>
                    <button className="btn btn--green btn--sm" title="Renew 30 days" onClick={() => handleSubscription(u._id, 'renew', u.subscription?.plan || 'Starter')}>+30d</button>
                    {u.subscription?.status === 'active'
                      ? <button className="admin__del" title="Deactivate" onClick={() => handleSubscription(u._id, 'deactivate')}>✕</button>
                      : <button className="btn btn--ghost btn--sm" title="Activate" onClick={() => handleSubscription(u._id, 'activate', u.subscription?.plan || 'Starter')}>✓</button>
                    }
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan="7" className="admin__empty">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
