import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import {
  getMyStudents, getStudentDetail, addStudentRecord, deleteStudentRecord, getCourses,
  getClasses, createClass, deleteClass,
} from '../api/client';
import '../styles/dashboard.css';

const TXT = {
  en: {
    bar: 'AL-Rahma · Teacher', back: 'View site', logout: 'Logout',
    hi: 'Welcome', sub: 'Your students and their progress',
    students: 'My students', noStudents: 'No students have been assigned to you yet. Ask the admin to assign students to your account.',
    records: 'records', verses: 'verses memorized', open: 'Open',
    addRecord: 'Add follow-up', date: 'Date', course: 'Course (optional)', none: '—',
    grade: 'Grade /100', gradeLabel: 'Rating', attendance: 'Attendance', note: 'Note',
    present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused', notSet: 'Not set',
    save: 'Save record', history: 'Follow-up history', noRecords: 'No records yet.',
    courseProgress: 'Course progress', hifz: 'Memorization (Hifz)', noCourses: 'No course activity yet.',
    noHifz: 'No memorization recorded yet.', delete: 'Delete', close: 'Close',
    needField: 'Add at least a grade, attendance or note.', surah: 'Surah', ayah: 'ayah',
    classes: 'Live classes', scheduleClass: 'Schedule a live class', classTitle: 'Class title',
    student: 'Student', dateTime: 'Date & time', duration: 'Minutes', meetingUrl: 'Meeting link (Zoom / Meet / Jitsi)',
    schedule: 'Schedule', upcoming: 'Upcoming classes', noClasses: 'No upcoming classes.',
    cancelClass: 'Cancel', classNeed: 'Pick a student, a title and a date.', tzNote: 'Times use your local timezone.',
  },
  ar: {
    bar: 'الرحمة · المعلّم', back: 'عرض الموقع', logout: 'خروج',
    hi: 'أهلاً', sub: 'طلابك ومتابعة تقدّمهم',
    students: 'طلابي', noStudents: 'لسه مفيش طلاب متعيّنين ليك. اطلب من الأدمن يوزّع عليك طلاب.',
    records: 'سجل', verses: 'آية محفوظة', open: 'فتح',
    addRecord: 'إضافة متابعة', date: 'التاريخ', course: 'الكورس (اختياري)', none: '—',
    grade: 'الدرجة /100', gradeLabel: 'التقدير', attendance: 'الحضور', note: 'ملاحظة',
    present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر', notSet: 'غير محدد',
    save: 'حفظ المتابعة', history: 'سجل المتابعة', noRecords: 'لا توجد سجلات بعد.',
    courseProgress: 'تقدّم الكورسات', hifz: 'الحفظ', noCourses: 'لا يوجد نشاط في الكورسات بعد.',
    noHifz: 'لم يُسجَّل حفظ بعد.', delete: 'حذف', close: 'إغلاق',
    needField: 'ضِف على الأقل درجة أو حضور أو ملاحظة.', surah: 'سورة', ayah: 'آية',
    classes: 'الحصص المباشرة', scheduleClass: 'جدولة حصة مباشرة', classTitle: 'عنوان الحصة',
    student: 'الطالب', dateTime: 'التاريخ والوقت', duration: 'دقائق', meetingUrl: 'رابط الحصة (Zoom / Meet / Jitsi)',
    schedule: 'جدولة', upcoming: 'الحصص القادمة', noClasses: 'لا توجد حصص قادمة.',
    cancelClass: 'إلغاء', classNeed: 'اختر طالبًا وعنوانًا وتاريخًا.', tzNote: 'الأوقات بتوقيتك المحلي.',
  },
};

const EMPTY_CLASS = { student: '', title: '', startsAt: '', durationMin: 30, meetingUrl: '' };

const EMPTY_RECORD = { date: '', course: '', grade: '', gradeLabel: '', attendance: '', note: '' };

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (dt.getHours() || dt.getMinutes())
    ? `${date} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : date;
}

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const { lang } = useLang();
  const L = TXT[lang === 'ar' ? 'ar' : 'en'];
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [courses, setCourses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [openId, setOpenId]     = useState(null);   // student detail open
  const [detail, setDetail]     = useState(null);   // { student, records, hifz, courses }
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm]         = useState(EMPTY_RECORD);
  const [saving, setSaving]     = useState(false);

  const [classes, setClasses]   = useState([]);
  const [classForm, setClassForm] = useState(EMPTY_CLASS);
  const [classSaving, setClassSaving] = useState(false);

  const loadStudents = useCallback(async () => {
    try {
      const [s, c, cls] = await Promise.all([
        getMyStudents(),
        getCourses().catch(() => []),
        getClasses({ upcoming: 1 }).catch(() => []),
      ]);
      setStudents(s);
      setCourses(c || []);
      setClasses(cls || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  // datetime-local gives a local wall-clock string; new Date() reads it as local
  // time and toISOString() converts to UTC for the server to store.
  const scheduleClass = async (e) => {
    e.preventDefault();
    setError('');
    if (!classForm.student || !classForm.title.trim() || !classForm.startsAt) {
      setError(L.classNeed);
      return;
    }
    setClassSaving(true);
    try {
      const created = await createClass({
        student: classForm.student,
        title: classForm.title,
        startsAt: new Date(classForm.startsAt).toISOString(),
        durationMin: Number(classForm.durationMin) || 30,
        meetingUrl: classForm.meetingUrl || '',
      });
      setClasses((prev) => [...prev, created].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
      setClassForm(EMPTY_CLASS);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not schedule class');
    } finally {
      setClassSaving(false);
    }
  };

  const removeClass = async (id) => {
    if (!confirm(L.cancelClass + '?')) return;
    try {
      await deleteClass(id);
      setClasses((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel class');
    }
  };
  const setCls = (k) => (e) => setClassForm((f) => ({ ...f, [k]: e.target.value }));

  const openStudent = async (id) => {
    setOpenId(id);
    setDetail(null);
    setForm(EMPTY_RECORD);
    setError('');
    setDetailLoading(true);
    try {
      setDetail(await getStudentDetail(id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load student');
    } finally {
      setDetailLoading(false);
    }
  };
  const closeStudent = () => { setOpenId(null); setDetail(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (form.grade === '' && !form.gradeLabel && !form.attendance && !form.note.trim()) {
      setError(L.needField);
      return;
    }
    setSaving(true);
    try {
      const rec = await addStudentRecord(openId, {
        date: form.date || undefined,
        course: form.course || undefined,
        grade: form.grade === '' ? undefined : form.grade,
        gradeLabel: form.gradeLabel || undefined,
        attendance: form.attendance || undefined,
        note: form.note || undefined,
      });
      setDetail((d) => ({ ...d, records: [rec, ...d.records] }));
      setForm(EMPTY_RECORD);
      setStudents((prev) => prev.map((s) =>
        s._id === openId ? { ...s, recordCount: (s.recordCount || 0) + 1, lastRecordDate: rec.date } : s));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recordId) => {
    if (!confirm(L.delete + '?')) return;
    try {
      await deleteStudentRecord(recordId);
      setDetail((d) => ({ ...d, records: d.records.filter((r) => r._id !== recordId) }));
      setStudents((prev) => prev.map((s) =>
        s._id === openId ? { ...s, recordCount: Math.max(0, (s.recordCount || 1) - 1) } : s));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete record');
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="container admin__bar-inner">
          <strong>{L.bar}</strong>
          <div className="admin__bar-right">
            <span>{L.hi}, {user?.name}</span>
            <Link to="/messages" className="btn btn--ghost btn--sm">💬 {lang === 'ar' ? 'الرسائل' : 'Messages'}</Link>
            <Link to="/" className="btn btn--ghost btn--sm">{L.back}</Link>
            <button className="btn btn--gold btn--sm" onClick={handleLogout}>{L.logout}</button>
          </div>
        </div>
      </header>

      <main className="container admin__main">
        {error && !openId && <p className="auth__error">{error}</p>}

        {/* ── Live classes ── */}
        <section className="admin__panel" style={{ marginBottom: '1.5rem' }}>
          <h2>📅 {L.classes}</h2>
          <form onSubmit={scheduleClass} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 150 }}>
              <label>{L.student}</label>
              <select value={classForm.student} onChange={setCls('student')}>
                <option value="">{L.none}</option>
                {students.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
              <label>{L.classTitle}</label>
              <input value={classForm.title} onChange={setCls('title')} placeholder="Tajweed lesson" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{L.dateTime}</label>
              <input type="datetime-local" value={classForm.startsAt} onChange={setCls('startsAt')} />
            </div>
            <div className="field" style={{ marginBottom: 0, width: 90 }}>
              <label>{L.duration}</label>
              <input type="number" min="5" max="240" value={classForm.durationMin} onChange={setCls('durationMin')} />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
              <label>{L.meetingUrl}</label>
              <input value={classForm.meetingUrl} onChange={setCls('meetingUrl')} placeholder="https://meet.google.com/…" />
            </div>
            <button type="submit" className="btn btn--green" disabled={classSaving}>{L.schedule}</button>
          </form>
          <p style={{ color: 'var(--muted)', fontSize: '.8rem', margin: '0 0 10px' }}>🕒 {L.tzNote}</p>

          <h3 style={{ margin: '0 0 8px' }}>{L.upcoming} ({classes.length})</h3>
          {classes.length === 0 ? (
            <p className="admin__empty">{L.noClasses}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {classes.map((c) => (
                <li key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#f7faf8', border: '1px solid #e0e8e4', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <strong>{c.title}</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#666' }}>
                      🕒 {fmtDate(c.startsAt)} · {c.durationMin} min · {c.student?.name}
                    </p>
                  </div>
                  {c.meetingUrl && <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">Join</a>}
                  <button className="admin__del" onClick={() => removeClass(c._id)}>{L.cancelClass}</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin__panel">
          <h2>👨‍🏫 {L.students} ({students.length})</h2>
          {loading ? (
            <p className="admin__empty">…</p>
          ) : students.length === 0 ? (
            <p className="admin__empty">{L.noStudents}</p>
          ) : (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr><th>{lang === 'ar' ? 'الاسم' : 'Name'}</th><th>Email</th><th>{L.records}</th><th>{L.verses}</th><th></th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s._id}>
                      <td>{s.name}</td>
                      <td>{s.email}</td>
                      <td>{s.recordCount || 0}</td>
                      <td>{s.memorizedVerses || 0}</td>
                      <td>
                        <button className="btn btn--green btn--sm" onClick={() => openStudent(s._id)}>{L.open}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ── Student detail modal ── */}
      {openId && (
        <div className="modal" onClick={closeStudent}>
          <div className="modal__card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 680, width: '94%' }}>
            <button className="modal__close" onClick={closeStudent} aria-label={L.close}>×</button>

            {detailLoading || !detail ? (
              <p className="admin__empty">…</p>
            ) : (
              <>
                <h3 className="modal__title" style={{ marginBottom: 4 }}>👤 {detail.student.name}</h3>
                <p style={{ color: '#888', fontSize: '.85rem', marginTop: 0 }}>{detail.student.email}</p>

                {error && <p className="auth__error">{error}</p>}

                {/* Add record */}
                <h4 style={{ margin: '1rem 0 .6rem' }}>📝 {L.addRecord}</h4>
                <form onSubmit={handleSave} style={{ background: '#f7faf8', border: '1px solid #e0e8e4', borderRadius: 10, padding: 14 }}>
                  <div className="admin__row" style={{ gap: 8 }}>
                    <div className="field">
                      <label>{L.date}</label>
                      <input type="date" value={form.date} onChange={set('date')} />
                    </div>
                    <div className="field">
                      <label>{L.course}</label>
                      <select value={form.course} onChange={set('course')}>
                        <option value="">{L.none}</option>
                        {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="admin__row" style={{ gap: 8 }}>
                    <div className="field">
                      <label>{L.grade}</label>
                      <input type="number" min="0" max="100" value={form.grade} onChange={set('grade')} />
                    </div>
                    <div className="field">
                      <label>{L.gradeLabel}</label>
                      <input value={form.gradeLabel} placeholder={lang === 'ar' ? 'ممتاز' : 'Excellent'} onChange={set('gradeLabel')} />
                    </div>
                    <div className="field">
                      <label>{L.attendance}</label>
                      <select value={form.attendance} onChange={set('attendance')}>
                        <option value="">{L.notSet}</option>
                        <option value="present">{L.present}</option>
                        <option value="absent">{L.absent}</option>
                        <option value="late">{L.late}</option>
                        <option value="excused">{L.excused}</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>{L.note}</label>
                    <textarea rows="2" value={form.note} onChange={set('note')} />
                  </div>
                  <button type="submit" className="btn btn--green btn--block" disabled={saving}>
                    {saving ? '…' : `💾 ${L.save}`}
                  </button>
                </form>

                {/* Record history */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>🗂 {L.history}</h4>
                {detail.records.length === 0 ? (
                  <p className="admin__empty">{L.noRecords}</p>
                ) : (
                  <ul className="admin__list">
                    {detail.records.map((r) => (
                      <li key={r._id} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8 }}>
                          <strong style={{ fontSize: '.86rem' }}>{fmtDate(r.date)}</strong>
                          <button className="admin__del" onClick={() => handleDelete(r._id)}>{L.delete}</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {r.grade != null && <span className="admin__badge admin__badge--approved">{r.grade}/100</span>}
                          {r.gradeLabel && <span className="admin__badge">{r.gradeLabel}</span>}
                          {r.attendance && <span className="admin__badge">{L[r.attendance] || r.attendance}</span>}
                          {r.course && <span className="admin__badge">{r.course.icon} {r.course.title}</span>}
                        </div>
                        {r.note && <p style={{ margin: '2px 0 0', fontSize: '.85rem', color: '#444' }}>{r.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Course progress */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>📚 {L.courseProgress}</h4>
                {detail.courses.length ? (
                  <ul className="admin__list">
                    {detail.courses.map((c) => (
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
                ) : <p className="admin__empty">{L.noCourses}</p>}

                {/* Hifz */}
                <h4 style={{ margin: '1.4rem 0 .6rem' }}>🧠 {L.hifz}</h4>
                {detail.hifz.length ? (
                  <ul className="admin__list">
                    {detail.hifz.map((h) => (
                      <li key={h._id} style={{ alignItems: 'center' }}>
                        <span>{L.surah} {h.chapterId} — {h.chapterName || ''}</span>
                        <span style={{ fontSize: '.82rem', fontWeight: 600 }}>
                          {h.memorizedVerses?.length || 0}{h.totalVerses ? `/${h.totalVerses}` : ''} {L.ayah}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="admin__empty">{L.noHifz}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
