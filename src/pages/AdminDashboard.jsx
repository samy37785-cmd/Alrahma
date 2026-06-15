import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getTrials,
  getManualPayments,
  reviewManualPayment,
  getUsers,
} from '../api/client';
import api from '../api/client';

const EMPTY_COURSE = { title: '', description: '', icon: '📘', level: 'All levels' };

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [courses, setCourses]         = useState([]);
  const [trials, setTrials]           = useState([]);
  const [manualPays, setManualPays]   = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [users, setUsers]             = useState([]);
  const [form, setForm]               = useState(EMPTY_COURSE);
  const [editingId, setEditingId]     = useState(null);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState('courses');

  const loadAll = useCallback(async () => {
    try {
      const [c, t, m, s, u] = await Promise.all([
        getCourses(),
        getTrials(),
        getManualPayments(),
        api.get('/newsletter').then((r) => r.data),
        getUsers(),
      ]);
      setCourses(c);
      setTrials(t);
      setManualPays(m);
      setSubscribers(s);
      setUsers(u);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleReview = async (id, status) => {
    try {
      const updated = await reviewManualPayment(id, { status });
      setManualPays((prev) => prev.map((p) => (p._id === id ? updated : p)));
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const created = await createCourse(form);
      setCourses((prev) => [created, ...prev]);
      setForm(EMPTY_COURSE);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create course');
    }
  };

  const startEdit = (course) => {
    setEditingId(course._id);
    setForm({ title: course.title, description: course.description, icon: course.icon, level: course.level });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const updated = await updateCourse(editingId, form);
      setCourses((prev) => prev.map((c) => (c._id === editingId ? updated : c)));
      setEditingId(null);
      setForm(EMPTY_COURSE);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update course');
    }
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_COURSE); };

  const handleDelete = async (id) => {
    if (!confirm('Delete this course?')) return;
    try {
      await deleteCourse(id);
      setCourses((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete course');
    }
  };

  const TABS = [
    { key: 'courses',     label: 'Courses' },
    { key: 'trials',      label: `Trials (${trials.length})` },
    { key: 'payments',    label: `Payments (${manualPays.filter((p) => p.status === 'pending').length} pending)` },
    { key: 'newsletter',  label: `Newsletter (${subscribers.length})` },
    { key: 'users',       label: `Users (${users.length})` },
  ];

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="container admin__bar-inner">
          <strong>AL-Rahma · Admin</strong>
          <div className="admin__bar-right">
            <span>Hi, {user?.name}</span>
            <Link to="/" className="btn btn--ghost btn--sm">View site</Link>
            <button className="btn btn--gold btn--sm" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="container admin__main">
        {error && <p className="auth__error">{error}</p>}

        {/* Tab navigation */}
        <nav className="admin__tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`admin__tab${activeTab === t.key ? ' admin__tab--active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── Courses tab ── */}
        {activeTab === 'courses' && (
          <div className="admin__grid">
            {/* Add / Edit form */}
            <section className="admin__panel">
              <h2>{editingId ? 'Edit course' : 'Add a course'}</h2>
              <form onSubmit={editingId ? handleUpdate : handleAdd}>
                <div className="field">
                  <label htmlFor="title">Title</label>
                  <input id="title" name="title" value={form.title} onChange={handleChange} required />
                </div>
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" name="description" rows="3" value={form.description} onChange={handleChange} required />
                </div>
                <div className="admin__row">
                  <div className="field">
                    <label htmlFor="icon">Icon</label>
                    <input id="icon" name="icon" value={form.icon} onChange={handleChange} />
                  </div>
                  <div className="field">
                    <label htmlFor="level">Level</label>
                    <select id="level" name="level" value={form.level} onChange={handleChange}>
                      <option>All levels</option>
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" className="btn btn--green btn--block">
                    {editingId ? 'Save changes' : 'Add course'}
                  </button>
                  {editingId && (
                    <button type="button" className="btn btn--ghost btn--block" onClick={cancelEdit}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* Course list */}
            <section className="admin__panel">
              <h2>Courses ({courses.length})</h2>
              <ul className="admin__list">
                {courses.map((c) => (
                  <li key={c._id}>
                    <span>{c.icon} {c.title}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)}>Edit</button>
                      <button className="admin__del" onClick={() => handleDelete(c._id)}>Delete</button>
                    </div>
                  </li>
                ))}
                {courses.length === 0 && <p className="admin__empty">No courses yet.</p>}
              </ul>
            </section>
          </div>
        )}

        {/* ── Trials tab ── */}
        {activeTab === 'trials' && (
          <section className="admin__panel">
            <h2>Trial requests ({trials.length})</h2>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Course</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {trials.map((t) => (
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
        )}

        {/* ── Manual Payments tab ── */}
        {activeTab === 'payments' && (
          <section className="admin__panel">
            <h2>Manual Payments ({manualPays.filter((p) => p.status === 'pending').length} pending)</h2>
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
        )}

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <section className="admin__panel">
            <h2>Registered Users ({users.length})</h2>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Sub Status</th><th>Valid Until</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u._id}>
                      <td>{i + 1}</td>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td><span className="admin__badge">{u.role}</span></td>
                      <td>{u.subscription?.plan || '—'}</td>
                      <td>
                        <span className={`admin__badge admin__badge--${u.subscription?.status === 'active' ? 'approved' : 'rejected'}`}>
                          {u.subscription?.status || 'inactive'}
                        </span>
                      </td>
                      <td>{u.subscription?.validUntil ? new Date(u.subscription.validUntil).toLocaleDateString() : '—'}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan="8" className="admin__empty">No users yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Newsletter tab ── */}
        {activeTab === 'newsletter' && (
          <section className="admin__panel">
            <h2>Newsletter subscribers ({subscribers.length})</h2>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr><th>#</th><th>Email</th><th>Subscribed</th></tr>
                </thead>
                <tbody>
                  {subscribers.map((s, i) => (
                    <tr key={s._id}>
                      <td>{i + 1}</td>
                      <td>{s.email}</td>
                      <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {subscribers.length === 0 && (
                    <tr><td colSpan="3" className="admin__empty">No subscribers yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
