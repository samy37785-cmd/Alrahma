import { useState } from 'react';
import { createCourse, updateCourse, deleteCourse } from '../../../api/courseApi';

const EMPTY_COURSE = { title: '', description: '', icon: '📘', level: 'All levels', resources: [], modules: [] };
const EMPTY_RES    = { type: 'youtube', label: '', url: '' };
const EMPTY_MODULE = { title: '', summary: '', lessons: [] };
const EMPTY_LESSON = { title: '', type: 'video', url: '', content: '', duration: '' };

export default function AdminCoursesTab({ courses, onCoursesChange, onError }) {
  const [form, setForm]           = useState(EMPTY_COURSE);
  const [editingId, setEditingId] = useState(null);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const created = await createCourse(form);
      onCoursesChange((prev) => [created, ...prev]);
      setForm(EMPTY_COURSE);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not create course');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const updated = await updateCourse(editingId, form);
      onCoursesChange((prev) => prev.map((c) => (c._id === editingId ? updated : c)));
      setEditingId(null);
      setForm(EMPTY_COURSE);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not update course');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this course?')) return;
    try {
      await deleteCourse(id);
      onCoursesChange((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      onError(err.response?.data?.message || 'Could not delete course');
    }
  };

  const startEdit = (course) => {
    setEditingId(course._id);
    setForm({ title: course.title, description: course.description, icon: course.icon, level: course.level, resources: course.resources || [], modules: course.modules || [] });
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_COURSE); };

  const addResource    = ()           => setForm((f) => ({ ...f, resources: [...f.resources, { ...EMPTY_RES }] }));
  const removeResource = (i)          => setForm((f) => ({ ...f, resources: f.resources.filter((_, idx) => idx !== i) }));
  const updateResource = (i, key, val) => setForm((f) => ({ ...f, resources: f.resources.map((r, idx) => idx === i ? { ...r, [key]: val } : r) }));

  const addModule    = ()      => setForm((f) => ({ ...f, modules: [...f.modules, { ...EMPTY_MODULE, lessons: [] }] }));
  const removeModule = (mi)    => setForm((f) => ({ ...f, modules: f.modules.filter((_, i) => i !== mi) }));
  const updateModule = (mi, key, val) => setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, [key]: val } : m) }));
  const addLesson    = (mi)    => setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, lessons: [...(m.lessons || []), { ...EMPTY_LESSON }] } : m) }));
  const removeLesson = (mi, li) => setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, lessons: m.lessons.filter((_, j) => j !== li) } : m) }));
  const updateLesson = (mi, li, key, val) => setForm((f) => ({ ...f, modules: f.modules.map((m, i) => i === mi ? { ...m, lessons: m.lessons.map((l, j) => j === li ? { ...l, [key]: val } : l) } : m) }));

  return (
    <div className="admin__grid">
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

          <div className="field" style={{ marginTop: '1rem' }}>
            <label style={{ marginBottom: '0.5rem', display: 'block' }}>Resources (YouTube / PDF / Links)</label>
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
            <button type="button" className="btn btn--ghost btn--sm" onClick={addResource} style={{ marginTop: '4px' }}>+ Add resource</button>
          </div>

          <div className="field" style={{ marginTop: '1.25rem' }}>
            <label style={{ marginBottom: '0.5rem', display: 'block' }}>Modules & lessons (structured content)</label>
            {form.modules.map((m, mi) => (
              <div key={mi} style={{ border: '1px solid #d9e4dd', borderRadius: 8, padding: '10px 12px', marginBottom: '10px', background: '#fafdfb' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ color: '#00543b' }}>{mi + 1}.</strong>
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
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => addLesson(mi)} style={{ marginTop: '2px', marginLeft: '12px' }}>+ Add lesson</button>
              </div>
            ))}
            <button type="button" className="btn btn--ghost btn--sm" onClick={addModule}>+ Add module</button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn--green btn--block">{editingId ? 'Save changes' : 'Add course'}</button>
            {editingId && <button type="button" className="btn btn--ghost btn--block" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </section>

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
  );
}
