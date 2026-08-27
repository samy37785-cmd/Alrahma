import { useState } from 'react';
import { updateUserSubscription, updateUserRole, assignTeacher, setFamilyName } from '../../../api/adminApi';

export default function AdminUsersTab({ users, usersTotal, teachers, onOpenReport, onUsersChange, onError }) {
  const [userSearch, setUserSearch] = useState('');

  const handleRoleChange = async (userId, role) => {
    try {
      await updateUserRole(userId, role);
      onUsersChange((prev) => prev.map((u) => (u._id === userId ? { ...u, role, teacher: null } : u)));
    } catch (err) {
      onError(err.response?.data?.message || 'Could not change role');
    }
  };

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
                  <select className="admin__inline-select" value={u.role} onChange={(e) => handleRoleChange(u._id, e.target.value)}>
                    <option value="student">student</option>
                    <option value="teacher">teacher</option>
                    <option value="parent">parent</option>
                    <option value="admin">admin</option>
                  </select>
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
