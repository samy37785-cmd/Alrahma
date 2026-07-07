import { useState } from 'react';
import { adminCreateUser } from '../../../api/adminApi';

const EMPTY_STAFF = { name: '', email: '', password: '', role: 'teacher' };

export default function AdminStaffTab({ teachers, users, onStaffCreated, onError }) {
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF);
  const [staffMsg, setStaffMsg] = useState('');

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setStaffMsg('');
    try {
      const created = await adminCreateUser(staffForm);
      setStaffMsg(`✓ ${created.role} account created: ${created.email}`);
      setStaffForm(EMPTY_STAFF);
      onStaffCreated();
    } catch (err) {
      onError(err.response?.data?.message || 'Could not create account');
    }
  };

  return (
    <div className="admin__grid">
      <section className="admin__panel">
        <h2>Create teacher / parent account</h2>
        {staffMsg && <p className="profile-page__success">{staffMsg}</p>}
        <form onSubmit={handleCreateStaff}>
          <div className="field">
            <label>Role</label>
            <select value={staffForm.role} onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
            </select>
          </div>
          <div className="field">
            <label>Full name</label>
            <input value={staffForm.name} onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Temporary password</label>
            <input value={staffForm.password} minLength={6} onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          <button type="submit" className="btn btn--green btn--block">Create account</button>
          <p style={{ color: '#888', fontSize: '.82rem', marginTop: 8 }}>
            Give the account holder this email + password so they can log in. A teacher gets students assigned from the Users tab; a parent links to their child with the child&apos;s link code.
          </p>
        </form>
      </section>

      <section className="admin__panel">
        <h2>Teachers ({teachers.length})</h2>
        <ul className="admin__list">
          {teachers.map((te) => {
            const count = users.filter((u) => u.teacher?._id === te._id).length;
            return (
              <li key={te._id} style={{ alignItems: 'center' }}>
                <span>👨‍🏫 {te.name}<small style={{ display: 'block', color: '#888' }}>{te.email}</small></span>
                <span className="admin__badge">{count} student{count === 1 ? '' : 's'}</span>
              </li>
            );
          })}
          {teachers.length === 0 && <p className="admin__empty">No teachers yet. Create one on the left.</p>}
        </ul>
      </section>
    </div>
  );
}
