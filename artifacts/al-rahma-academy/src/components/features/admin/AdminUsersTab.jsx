import { useState } from 'react';
import { updateUserSubscription, assignTeacher, setFamilyName } from '../../../api/adminApi';

// Stage 2A (see docs/user-admin-auth-contract.md, Section 9): the role
// column used to be an interactive <select> that called updateUserRole()
// (PATCH /v1/admin/users/:id/role) directly - a real, unaudited admin-
// elevation path that reverse-proxies to the external, untracked Upstream
// (see docs/legacy-roles-dashboard-reachability-audit.md). This task does
// not wire it to any new, locally-proven RPC (admin_set_role() exists in
// lib/db but is NOT connected here or anywhere in this app), so the
// mutation is disabled rather than left pointed at an unverified backend.
// Full read/write role management against a proven Supabase-backed RPC is
// deferred to Batch 2E.
export default function AdminUsersTab({ users, usersTotal, teachers, onOpenReport, onUsersChange, onError }) {
  const [userSearch, setUserSearch] = useState('');

  const handleAssignTeacher = async (studentId, teacherId) => {
    try {
      const res = await assignTeacher(studentId, teacherId);
      onUsersChange((prev) => prev.map((u) => (u._id === studentId ? { ...u, teacher: res.teacher } : u)));
    } catch (err) {
      onError(err.response?.data?.message || 'Could not assign teacher');
    }
  };

  const handleFamilyInput = (studentId, value) =>
    onUsersChange((prev) => prev.map((u) => (u._id === studentId ? { ...u, familyName: value } : u)));

  const handleFamilySave = async (studentId, value) => {
    try {
      await setFamilyName(studentId, value);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not save family name');
    }
  };

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
            <tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Teacher</th><th>Family</th><th>Plan</th><th>Status</th><th>Valid Until</th><th>Action</th></tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u._id}>
                <td>{i + 1}</td>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {/* Read-only: role changes are disabled here, not wired to
                      an unproven backend mutation. See the file-level
                      comment above and docs/user-admin-auth-contract.md. */}
                  <span className="admin__badge" title="Role changes are disabled pending a proven backend RPC (deferred to Batch 2E)">
                    {u.role}
                  </span>
                </td>
                <td>
                  {u.role === 'student' ? (
                    <select className="admin__inline-select" value={u.teacher?._id || ''} onChange={(e) => handleAssignTeacher(u._id, e.target.value)}>
                      <option value="">— none —</option>
                      {teachers.map((te) => <option key={te._id} value={te._id}>{te.name}</option>)}
                    </select>
                  ) : '—'}
                </td>
                <td>
                  {u.role === 'student' ? (
                    <input
                      className="admin__inline-select"
                      style={{ width: 90 }}
                      value={u.familyName || ''}
                      placeholder="—"
                      onChange={(e) => handleFamilyInput(u._id, e.target.value)}
                      onBlur={(e) => handleFamilySave(u._id, e.target.value)}
                    />
                  ) : '—'}
                </td>
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
              <tr><td colSpan="10" className="admin__empty">No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
