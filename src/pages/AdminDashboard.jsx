import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getCourses,
  createCourse,
  deleteCourse,
  getTrials,
} from '../api/client';

const EMPTY_COURSE = { title: '', description: '', icon: '📘', level: 'All levels' };

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [courses, setCourses] = useState([]);
  const [trials, setTrials] = useState([]);
  const [form, setForm] = useState(EMPTY_COURSE);
  const [error, setError] = useState('');

  // Load both lists once on mount.
  const loadAll = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([getCourses(), getTrials()]);
      setCourses(c);
      setTrials(t);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  const handleDelete = async (id) => {
    if (!confirm('Delete this course?')) return;
    try {
      await deleteCourse(id);
      setCourses((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete course');
    }
  };

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

        <div className="admin__grid">
          {/* Add course */}
          <section className="admin__panel">
            <h2>Add a course</h2>
            <form onSubmit={handleAdd}>
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
              <button type="submit" className="btn btn--green btn--block">Add course</button>
            </form>
          </section>

          {/* Course list */}
          <section className="admin__panel">
            <h2>Courses ({courses.length})</h2>
            <ul className="admin__list">
              {courses.map((c) => (
                <li key={c._id}>
                  <span>{c.icon} {c.title}</span>
                  <button className="admin__del" onClick={() => handleDelete(c._id)}>Delete</button>
                </li>
              ))}
              {courses.length === 0 && <p className="admin__empty">No courses yet.</p>}
            </ul>
          </section>
        </div>

        {/* Trial requests */}
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
      </main>
    </div>
  );
}
