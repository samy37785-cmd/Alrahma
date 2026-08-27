import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, ClipboardList, FileText, GraduationCap, Save } from 'lucide-react';
import { getStudentDetail, addStudentRecord, deleteStudentRecord } from '../../../api/teacherApi';
import ProgressRing from '../../ui/ProgressRing';
import { getNameInitials } from '../../../utils/nameInitials';
import { formatDateTime as fmtDate } from '../../../utils/date';
const EMPTY_RECORD = { date: '', course: '', grade: '', gradeLabel: '', attendance: '', note: '' };

function gradeColor(g) {
  if (g >= 85) return 'ds-badge--green';
  if (g >= 60) return 'ds-badge--yellow';
  return 'ds-badge--red';
}

function attendanceColor(a) {
  if (a === 'present') return 'ds-badge--green';
  if (a === 'absent')  return 'ds-badge--red';
  if (a === 'late')    return 'ds-badge--yellow';
  return 'ds-badge--gray';
}

/* ══════════════════════════════════════════════════════════════════
   STUDENT DETAIL MODAL
   ══════════════════════════════════════════════════════════════════ */
export default function StudentModal({ studentId, students, courses, L, lang, onClose }) {
  const queryClient = useQueryClient();
  const [form,            setForm]            = useState(EMPTY_RECORD);
  const [error,           setError]           = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { data: detail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['teacher', 'student', studentId],
    queryFn:  () => getStudentDetail(studentId),
    enabled:  !!studentId,
    staleTime: 0,
  });

  const student = students.find((s) => s._id === studentId);

  const addRecord = useMutation({
    mutationFn: ({ studentId: sid, data }) => addStudentRecord(sid, data),
    onSuccess: (rec, { studentId: sid }) => {
      queryClient.setQueryData(['teacher', 'student', sid], (old) =>
        old ? { ...old, records: [rec, ...old.records] } : old
      );
      queryClient.setQueryData(['teacher', 'students'], (old = []) =>
        old.map((s) => s._id === sid ? { ...s, recordCount: (s.recordCount || 0) + 1 } : s)
      );
      setForm(EMPTY_RECORD);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not save record'),
  });

  const delRecord = useMutation({
    mutationFn: ({ recordId }) => deleteStudentRecord(recordId),
    onSuccess: (_, { recordId, studentId: sid }) => {
      queryClient.setQueryData(['teacher', 'student', sid], (old) =>
        old ? { ...old, records: old.records.filter((r) => r._id !== recordId) } : old
      );
      queryClient.setQueryData(['teacher', 'students'], (old = []) =>
        old.map((s) => s._id === sid ? { ...s, recordCount: Math.max(0, (s.recordCount || 1) - 1) } : s)
      );
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not delete'),
  });

  const handleSave = (e) => {
    e.preventDefault();
    setError('');
    if (form.grade === '' && !form.gradeLabel && !form.attendance && !form.note.trim()) {
      setError(L.needField);
      return;
    }
    addRecord.mutate({
      studentId,
      data: {
        date:        form.date || undefined,
        course:      form.course || undefined,
        grade:       form.grade === '' ? undefined : form.grade,
        gradeLabel:  form.gradeLabel || undefined,
        attendance:  form.attendance || undefined,
        note:        form.note || undefined,
      },
    });
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const initials = getNameInitials(student?.name) || '?';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(3px)', zIndex: 'var(--z-modal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)', borderRadius: 16,
          width: '100%', maxWidth: 660, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%', background: 'var(--grad-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {student?.name || '—'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {student?.email} · {student?.recordCount || 0} records · {student?.memorizedVerses || 0} verses
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border-default)',
              background: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            aria-label={L.close}
          >
            ✕
          </button>
        </div>

        {/* Modal body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {detailError ? (
            <p style={{ color: 'var(--color-danger)', margin: '20px 0', fontSize: '0.875rem' }}>
              {detailError?.response?.data?.message || 'Failed to load student data'}
            </p>
          ) : detailLoading || !detail ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <div className="ds-spinner" />
            </div>
          ) : (
            <>
              {error && (
                <div style={{
                  background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
                  borderRadius: 8, padding: '10px 14px', margin: '12px 0',
                  color: 'var(--color-danger-text)', fontSize: '0.82rem',
                }}>
                  {error}
                </div>
              )}

              {/* Add follow-up */}
              <h4 style={{ margin: '18px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} aria-hidden="true" /> Add follow-up
              </h4>
              <form
                onSubmit={handleSave}
                style={{
                  background: 'var(--bg-page)', border: '1px solid var(--border-default)',
                  borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem' }}>Date</label>
                    <input type="date" value={form.date} onChange={set('date')} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem' }}>{L.attendance}</label>
                    <select value={form.attendance} onChange={set('attendance')}>
                      <option value="">{L.notSet}</option>
                      <option value="present">{L.present}</option>
                      <option value="absent">{L.absent}</option>
                      <option value="late">{L.late}</option>
                      <option value="excused">{L.excused}</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 10 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem' }}>{L.grade}</label>
                    <input type="number" min="0" max="100" value={form.grade} onChange={set('grade')} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem' }}>{L.gradeLabel}</label>
                    <input value={form.gradeLabel} placeholder="Excellent" onChange={set('gradeLabel')} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.78rem' }}>Course</label>
                    <select value={form.course} onChange={set('course')}>
                      <option value="">—</option>
                      {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>{L.note}</label>
                  <textarea rows="2" value={form.note} onChange={set('note')} style={{ resize: 'vertical' }} />
                </div>
                <button
                  type="submit"
                  className="btn btn--green"
                  style={{ alignSelf: 'flex-start', borderRadius: 8, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5 }}
                  disabled={addRecord.isPending}
                >
                  {addRecord.isPending ? '…' : <><Save size={13} aria-hidden="true" /> {L.save}</>}
                </button>
              </form>

              {/* Follow-up history */}
              <h4 style={{ margin: '20px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={14} aria-hidden="true" /> {L.history} ({detail.records.length})
              </h4>
              {detail.records.length === 0 ? (
                <div className="ds-empty" style={{ padding: '16px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1rem' }}>📋</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>{L.noRecords}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.records.map((r) => (
                    <div key={r._id} style={{
                      background: 'var(--bg-page)', border: '1px solid var(--border-default)',
                      borderRadius: 9, padding: '10px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {fmtDate(r.date)}
                        </span>
                        {r.grade != null && (
                          <span className={`ds-badge ${gradeColor(r.grade)}`}>{r.grade}/100</span>
                        )}
                        {r.gradeLabel && <span className="ds-badge ds-badge--blue">{r.gradeLabel}</span>}
                        {r.attendance && (
                          <span className={`ds-badge ${attendanceColor(r.attendance)}`}>
                            {r.attendance}
                          </span>
                        )}
                        {r.course && (
                          <span className="ds-badge ds-badge--gray">{r.course.icon} {r.course.title}</span>
                        )}
                        <button
                          onClick={() => setDeleteConfirmId(r._id)}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.78rem', fontWeight: 600 }}
                          disabled={delRecord.isPending}
                        >
                          {L.delete}
                        </button>
                      </div>
                      {deleteConfirmId === r._id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 10px', borderRadius: 7, background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)' }}>
                          <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--color-danger-text)' }}>
                            {lang === 'ar' ? 'حذف هذا السجل نهائيًا؟' : 'Permanently delete this record?'}
                          </span>
                          <button
                            className="btn btn--sm"
                            style={{ borderRadius: 6, background: 'var(--color-danger)', color: '#fff', border: 'none', fontSize: '0.75rem', minHeight: 32 }}
                            onClick={() => { delRecord.mutate({ recordId: r._id, studentId }); setDeleteConfirmId(null); }}
                            disabled={delRecord.isPending}
                          >
                            {L.delete}
                          </button>
                          <button
                            className="btn btn--ghost btn--sm"
                            style={{ borderRadius: 6, fontSize: '0.75rem', minHeight: 32 }}
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            {L.close}
                          </button>
                        </div>
                      )}
                      {r.note && (
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Course progress */}
              <h4 style={{ margin: '20px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <GraduationCap size={14} aria-hidden="true" /> {L.courseProgress}
              </h4>
              {detail.courses.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{L.noCourses}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detail.courses.map((c) => (
                    <div key={c.courseId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: '1rem' }}>{c.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.title}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>
                            {c.done}/{c.total}
                          </span>
                        </div>
                        <div className="ds-bar">
                          <div className="ds-bar__fill" style={{ width: `${c.percent}%` }} />
                        </div>
                      </div>
                      <ProgressRing value={c.percent} size={36} stroke={4} />
                    </div>
                  ))}
                </div>
              )}

              {/* Hifz */}
              <h4 style={{ margin: '20px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={14} aria-hidden="true" /> {L.hifz}
              </h4>
              {detail.hifz.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{L.noHifz}</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {detail.hifz.map((h) => (
                    <div key={h._id} style={{
                      padding: '6px 10px', borderRadius: 8,
                      background: 'var(--color-success-surface)', border: '1px solid var(--color-success-border)',
                      fontSize: '0.78rem',
                    }}>
                      <strong style={{ color: 'var(--text-brand)' }}>{L.surah} {h.chapterId}</strong>
                      {h.chapterName && <span style={{ color: 'var(--text-secondary)' }}> — {h.chapterName}</span>}
                      <br />
                      <span style={{ color: 'var(--color-success-text)', fontSize: '0.72rem' }}>
                        {h.memorizedVerses?.length || 0}{h.totalVerses ? `/${h.totalVerses}` : ''} {L.ayah}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
