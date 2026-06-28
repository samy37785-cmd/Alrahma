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
  listTeachers,
  adminCreateUser,
  updateUserRole,
  assignTeacher,
  setFamilyName,
} from '../api/client';
import api from '../api/client';

const EMPTY_CERT = { type: 'completion', title: '', grade: '', notes: '' };
const EMPTY_STAFF = { name: '', email: '', password: '', role: 'teacher' };

const EMPTY_COURSE = { title: '', description: '', icon: '📘', level: 'All levels', resources: [], modules: [] };
const EMPTY_RES    = { type: 'youtube', label: '', url: '' };
const EMPTY_MODULE = { title: '', summary: '', lessons: [] };
const EMPTY_LESSON = { title: '', type: 'video', url: '', content: '', duration: '' };

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

  const [teachers, setTeachers] = useState([]);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF);
  const [staffMsg, setStaffMsg]   = useState('');

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
      const [c, t, m, s, u, te] = await Promise.all([
        getCourses(),
        getTrials(),
        getManualPayments(),
        api.get('/newsletter').then((r) => r.data),
        getUsers(),
        listTeachers().catch(() => []),
      ]);
      setCourses(c);
      setTrials(t);
      setManualPays(m);
      setSubscribers(s);
      setUsers(u);
      setTeachers(te);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    }
  }, []);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setError(''); setStaffMsg('');
    try {
      const created = await adminCreateUser(staffForm);
      setStaffMsg(`✓ ${created.role} account created: ${created.email}`);
      setStaffForm(EMPTY_STAFF);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create account');
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      await updateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, role, teacher: null } : u)));
      loadAll();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change role');
    }
  };

  const handleAssignTeacher = async (studentId, teacherId) => {
    try {
      const res = await assignTeacher(studentId, teacherId);
      setUsers((prev) => prev.map((u) => (u._id === studentId ? { ...u, teacher: res.teacher } : u)));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not assign teacher');
    }
  };

  // Local edit of family name; saved to the server on blur.
  const handleFamilyInput = (studentId, value) =>
    setUsers((prev) => prev.map((u) => (u._id === studentId ? { ...u, familyName: value } : u)));
  const handleFamilySave = async (studentId, value) => {
    try {
      await setFamilyName(studentId, value);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save family name');
    }
  };

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
    setForm({
      title: course.title, description: course.description, icon: course.icon, level: course.level,
      resources: course.resources || [], modules: course.modules || [],
    });
  };

  const addResource    = ()        => setForm((f) => ({ ...f, resources: [...f.resources, { ...EMPTY_RES }] }));
  const removeResource = (i)       => setForm((f) => ({ ...f, resources: f.resources.filter((_, idx) => idx !== i) }));
  const updateResource = (i, key, val) =>
    setForm((f) => ({ ...f, resources: f.resources.map((r, idx) => idx === i ? { ...r, [key]: val } : r) }));

  // --- Module / lesson editors (structured course content) ---
  const addModule    = ()  => setForm((f) => ({ ...f, modules: [...f.modules, { ...EMPTY_MODULE, lessons: [] }] }));
  const removeModule = (mi) => setForm((f) => ({ ...f, modules: f.modules.filter((_, i) => i !== mi) }));
  const updateModule = (mi, key, val) =>
    setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, [key]: val } : m) }));
  const addLesson    = (mi) =>
    setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, lessons: [...(m.lessons || []), { ...EMPTY_LESSON }] } : m) }));
  const removeLesson = (mi, li) =>
    setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, lessons: m.lessons.filter((_, j) => j !== li) } : m) }));
  const updateLesson = (mi, li, key, val) =>
    setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi
      ? { ...m, lessons: m.lessons.map((l, j) => j === li ? { ...l, [key]: val } : l) }
      : m) }));

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
    { key: 'staff',       label: `Staff (${teachers.length})` },
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

                {/* Structured modules → lessons */}
                <div className="field" style={{ marginTop: '1.25rem' }}>
                  <label style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Modules & lessons (structured content)
                  </label>
                  {form.modules.map((m, mi) => (
                    <div key={mi} style={{ border: '1px solid #d9e4dd', borderRadius: 8, padding: '10px 12px', marginBottom: '10px', background: '#fafdfb' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ color: '#0b6e4f' }}>{mi + 1}.</strong>
                        <input placeholder="Module title" value={m.title} onChange={(e) => updateModule(mi, 'title', e.target.value)} style={{ flex: 1 }} />
                        <button type="button" className="admin__del" onClick={() => removeModule(mi)} style={{ padding: '4px 8px' }}>✕</button>
                      </div>
                      <input placeholder="Short summary (optional)" value={m.summary} onChange={(e) => updateModule(mi, 'summary', e.target.value)} style={{ width: '100%', marginBottom: '8px' }} />
                      {(m.lessons || []).map((l, li) => (
                        <div key={li} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center', flexWrap: 'wrap', paddingLeft: '12px' }}>
                          <select value={l.type} onChange={(e) => updateLesson(mi, li, 'type', e.target.value)} style={{ width: '90px' }}>
                            <option value="video">Video</option>
                            <option value="pdf">PDF</option>
                            <option value="link">Link</option>
                            <option value="text">Text</option>
                          </select>
                          <input placeholder="Lesson title" value={l.title} onChange={(e) => updateLesson(mi, li, 'title', e.target.value)} style={{ flex: 1, minWidth: '110px' }} />
                          {l.type === 'text' ? (
                            <textarea placeholder="Lesson text" rows="2" value={l.content} onChange={(e) => updateLesson(mi, li, 'content', e.target.value)} style={{ flex: 2, minWidth: '140px' }} />
                          ) : (
                            <input placeholder="URL" value={l.url} onChange={(e) => updateLesson(mi, li, 'url', e.target.value)} style={{ flex: 2, minWidth: '140px' }} />
                          )}
                          <input placeholder="Duration" value={l.duration} onChange={(e) => updateLesson(mi, li, 'duration', e.target.value)} style={{ width: '80px' }} />
                          <button type="button" className="admin__del" onClick={() => removeLesson(mi, li)} style={{ padding: '4px 8px' }}>✕</button>
                        </div>
                      ))}
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => addLesson(mi)} style={{ marginTop: '2px', marginLeft: '12px' }}>
                        + Add lesson
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={addModule}>
                    + Add module
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
                  <tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Teacher</th><th>Family</th><th>Plan</th><th>Status</th><th>Valid Until</th><th>Action</th></tr>
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
                      <td>
                        <select
                          className="admin__inline-select"
                          value={u.role}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                        >
                          <option value="student">student</option>
                          <option value="teacher">teacher</option>
                          <option value="parent">parent</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td>
                        {u.role === 'student' ? (
                          <select
                            className="admin__inline-select"
                            value={u.teacher?._id || ''}
                            onChange={(e) => handleAssignTeacher(u._id, e.target.value)}
                          >
                            <option value="">— none —</option>
                            {teachers.map((te) => (
                              <option key={te._id} value={te._id}>{te.name}</option>
                            ))}
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
                    <tr><td colSpan="10" className="admin__empty">No users yet.</td></tr>
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
        {/* ── Staff tab (teachers & parents) ── */}
        {activeTab === 'staff' && (
          <div className="admin__grid">
            {/* Create teacher / parent account */}
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

            {/* Teacher list + their student counts */}
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
