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
  updateUserSubscription,
  getUserHifzReport,
  getUserCourseProgress,
  issueCertificate,
  listCertificates,
  revokeCertificate,
} from '../api/client';
import api from '../api/client';

const EMPTY_CERT = { type: 'completion', title: '', grade: '', notes: '' };

const EMPTY_COURSE = { title: '', description: '', icon: '📘', level: 'All levels', resources: [] };
const EMPTY_RES    = { type: 'youtube', label: '', url: '' };

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
  const [trialSearch, setTrialSearch] = useState('');
  const [userSearch, setUserSearch]   = useState('');
  const [reportUser, setReportUser]   = useState(null);  // student whose report is open
  const [report, setReport]           = useState(null);  // { hifz, courses }
  const [reportLoading, setReportLoading] = useState(false);

  const [certs, setCerts]     = useState([]);
  const [certForm, setCertForm] = useState(EMPTY_CERT);

  const openReport = async (u) => {
    setReportUser(u);
    setReport(null);
    setCerts([]);
    setCertForm(EMPTY_CERT);
    setReportLoading(true);
    try {
      const [hifz, courses, userCerts] = await Promise.all([
        getUserHifzReport(u._id).catch(() => []),
        getUserCourseProgress(u._id).catch(() => []),
        listCertificates(u._id).catch(() => []),
      ]);
      setReport({ hifz, courses });
      setCerts(userCerts);
    } finally {
      setReportLoading(false);
    }
  };
  const closeReport = () => { setReportUser(null); setReport(null); setCerts([]); };

  const handleIssueCert = async (e) => {
    e.preventDefault();
    if (!certForm.title.trim()) return;
    try {
      const cert = await issueCertificate({ userId: reportUser._id, ...certForm });
      setCerts((prev) => [cert, ...prev]);
      setCertForm(EMPTY_CERT);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not issue certificate');
    }
  };

  const handleRevokeCert = async (id) => {
    if (!confirm('Revoke this certificate?')) return;
    try {
      await revokeCertificate(id);
      setCerts((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not revoke certificate');
    }
  };

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
    setForm({ title: course.title, description: course.description, icon: course.icon, level: course.level, resources: course.resources || [] });
  };

  const addResource    = ()        => setForm((f) => ({ ...f, resources: [...f.resources, { ...EMPTY_RES }] }));
  const removeResource = (i)       => setForm((f) => ({ ...f, resources: f.resources.filter((_, idx) => idx !== i) }));
  const updateResource = (i, key, val) =>
    setForm((f) => ({ ...f, resources: f.resources.map((r, idx) => idx === i ? { ...r, [key]: val } : r) }));

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

  const handleSubscription = async (userId, action, plan) => {
    try {
      const updated = await updateUserSubscription(userId, { action, plan });
      setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, subscription: updated.subscription } : u));
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

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
                {/* Resources */}
                <div className="field" style={{ marginTop: '1rem' }}>
                  <label style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Resources (YouTube / PDF / Links)
                  </label>
                  {form.resources.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={r.type} onChange={(e) => updateResource(i, 'type', e.target.value)} style={{ width: '100px' }}>
                        <option value="youtube">YouTube</option>
                        <option value="pdf">PDF</option>
                        <option value="link">Link</option>
                      </select>
                      <input placeholder="Label" value={r.label} onChange={(e) => updateResource(i, 'label', e.target.value)} style={{ flex: 1, minWidth: '100px' }} />
                      <input placeholder="URL" value={r.url} onChange={(e) => updateResource(i, 'url', e.target.value)} style={{ flex: 2, minWidth: '140px' }} />
                      <button type="button" className="admin__del" onClick={() => removeResource(i)} style={{ padding: '4px 8px' }}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={addResource} style={{ marginTop: '4px' }}>
                    + Add resource
                  </button>
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
                  {trials
                    .filter((t) => !trialSearch ||
                      t.name?.toLowerCase().includes(trialSearch.toLowerCase()) ||
                      t.email?.toLowerCase().includes(trialSearch.toLowerCase()) ||
                      t.course?.toLowerCase().includes(trialSearch.toLowerCase()))
                    .map((t) => (
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
            <div className="admin__panel-head">
              <h2>Registered Users ({users.length})</h2>
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
                  <tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Status</th><th>Valid Until</th><th>Joined</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {users
                    .filter((u) => !userSearch ||
                      u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                      u.email?.toLowerCase().includes(userSearch.toLowerCase()))
                    .map((u, i) => (
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
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn--ghost btn--sm" title="View progress report"
                            onClick={() => openReport(u)}>
                            📊
                          </button>
                          <button className="btn btn--green btn--sm" title="Renew 30 days"
                            onClick={() => handleSubscription(u._id, 'renew', u.subscription?.plan || 'Starter')}>
                            +30d
                          </button>
                          {u.subscription?.status === 'active'
                            ? <button className="admin__del" title="Deactivate" onClick={() => handleSubscription(u._id, 'deactivate')}>✕</button>
                            : <button className="btn btn--ghost btn--sm" title="Activate" onClick={() => handleSubscription(u._id, 'activate', u.subscription?.plan || 'Starter')}>✓</button>
                          }
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan="9" className="admin__empty">No users yet.</td></tr>
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

      {/* ── Student progress report modal ── */}
      {reportUser && (
        <div className="modal" onClick={closeReport}>
          <div className="modal__card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 640, width: '92%' }}>
            <button className="modal__close" onClick={closeReport} aria-label="Close">×</button>
            <h3 className="modal__title" style={{ marginBottom: 4 }}>📊 {reportUser.name}</h3>
            <p style={{ color: '#888', fontSize: '.85rem', marginTop: 0 }}>{reportUser.email}</p>

            {reportLoading ? (
              <p className="admin__empty">Loading report…</p>
            ) : (
              <>
                {/* Courses */}
                <h4 style={{ margin: '1.2rem 0 .6rem' }}>📚 Courses</h4>
                {report?.courses?.length ? (
                  <ul className="admin__list">
                    {report.courses.map((c) => (
                      <li key={c.courseId} style={{ alignItems: 'center' }}>
                        <span>{c.icon} {c.title}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                          <div style={{ flex: 1, height: 7, background: '#e6efe9', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: `${c.percent}%`, height: '100%', background: '#0b6e4f' }} />
                          </div>
                          <span style={{ fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.done}/{c.total}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="admin__empty">No course activity yet.</p>}

                {/* Hifz */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>🧠 Memorization (Hifz)</h4>
                {report?.hifz?.length ? (
                  <ul className="admin__list">
                    {report.hifz.map((h) => (
                      <li key={h._id} style={{ alignItems: 'center' }}>
                        <span>سورة {h.chapterId} — {h.chapterName || ''}</span>
                        <span style={{ fontSize: '.82rem', fontWeight: 600 }}>
                          {h.memorizedVerses?.length || 0}{h.totalVerses ? `/${h.totalVerses}` : ''} آية
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="admin__empty">No memorization recorded yet.</p>}

                {/* Certificates */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>🎓 Certificates</h4>
                {certs.length > 0 && (
                  <ul className="admin__list" style={{ marginBottom: 12 }}>
                    {certs.map((c) => (
                      <li key={c._id} style={{ alignItems: 'center' }}>
                        <span>
                          {c.title}
                          <small style={{ display: 'block', color: '#888' }}>{c.certificateNumber} · {c.type}</small>
                        </span>
                        <button className="admin__del" onClick={() => handleRevokeCert(c._id)}>Revoke</button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Issue a new certificate */}
                <form onSubmit={handleIssueCert} style={{ background: '#f7faf8', border: '1px solid #e0e8e4', borderRadius: 10, padding: 14 }}>
                  <div className="admin__row" style={{ gap: 8 }}>
                    <div className="field">
                      <label>Type</label>
                      <select value={certForm.type} onChange={(e) => setCertForm((f) => ({ ...f, type: e.target.value }))}>
                        <option value="completion">Course Completion</option>
                        <option value="ijazah">Ijazah</option>
                        <option value="hifz">Hifz Milestone</option>
                        <option value="attendance">Attendance</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Grade (optional)</label>
                      <input value={certForm.grade} placeholder="Excellent / Mumtaz" onChange={(e) => setCertForm((f) => ({ ...f, grade: e.target.value }))} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Title</label>
                    <input value={certForm.title} placeholder="e.g. Ijazah in Hafs ‘an ‘Asim" required onChange={(e) => setCertForm((f) => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Notes (optional)</label>
                    <input value={certForm.notes} onChange={(e) => setCertForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <button type="submit" className="btn btn--green btn--block">🎓 Issue certificate</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
