/**
 * HomeworkPage — assignments, submissions, grading, and feedback.
 * Teachers: create assignments, view submissions, grade, leave comments.
 * Students: view assignments, upload submissions, track deadlines.
 * Parents: view-only.
 */

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import {
  FileText, Plus, Clock, Check, X, Upload, Download, MessageSquare,
  AlertCircle, ChevronDown, ChevronUp, Star, BookOpen, Filter,
  Paperclip, Send, Calendar,
} from 'lucide-react';

/* ── Status config ──────────────────────────────────────────────── */
const HW_STATUS = {
  pending:   { label: 'Pending',    color: '#d97706', bg: '#fef3c7' },
  submitted: { label: 'Submitted',  color: '#2563eb', bg: '#dbeafe' },
  graded:    { label: 'Graded',     color: '#16a34a', bg: '#dcfce7' },
  late:      { label: 'Late',       color: '#dc2626', bg: '#fee2e2' },
  overdue:   { label: 'Overdue',    color: '#dc2626', bg: '#fee2e2' },
};

function statusBadge(status) {
  const s = HW_STATUS[status] || { label: status, color: 'var(--text-secondary)', bg: 'var(--bg-page)' };
  return (
    <span style={{ display: 'inline-block', background: s.bg, color: s.color, padding: '3px 9px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${s.color}33` }}>
      {s.label}
    </span>
  );
}

function deadlineColor(deadline) {
  const diff = (new Date(deadline) - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0)  return '#dc2626';
  if (diff < 1)  return '#dc2626';
  if (diff < 3)  return '#d97706';
  return 'var(--text-secondary)';
}

function formatDeadline(iso) {
  const d = new Date(iso);
  const diff = Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
  const abs = Math.abs(diff);
  if (diff < 0)  return `${abs}d overdue`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff}d`;
}

/* ── API ────────────────────────────────────────────────────────── */
async function fetchHomework(role) {
  try {
    const { default: http } = await import('../api/http');
    const res = await http.get(role === 'teacher' ? '/api/homework/assigned' : '/api/homework/mine');
    return res.data?.assignments ?? res.data ?? [];
  } catch {
    const now = Date.now();
    const DAY = 86400000;
    return [
      { _id: 'hw1', title: 'Surah Al-Baqarah verses 1–10', subject: 'Quran', type: 'memorization', deadline: new Date(now + 2 * DAY).toISOString(), status: 'pending', points: 10, description: 'Memorize and recite with proper tajweed.', submissions: 3, totalStudents: 5, grade: null, feedback: '' },
      { _id: 'hw2', title: 'Arabic Verb Conjugation Exercise', subject: 'Arabic', type: 'written', deadline: new Date(now - 1 * DAY).toISOString(), status: 'graded', points: 20, description: 'Complete the verb conjugation worksheet for chapters 3–5.', submissions: 5, totalStudents: 5, grade: 17, feedback: 'Great effort! Work on the dual form.' },
      { _id: 'hw3', title: 'Tajweed Rules Essay', subject: 'Tajweed', type: 'written', deadline: new Date(now + 5 * DAY).toISOString(), status: 'submitted', points: 15, description: 'Write a 300-word essay on the rules of Madd.', submissions: 2, totalStudents: 5, grade: null, feedback: '' },
      { _id: 'hw4', title: 'Islamic History Reflection', subject: 'Islamic Studies', type: 'essay', deadline: new Date(now + 0.3 * DAY).toISOString(), status: 'pending', points: 25, description: 'Write a personal reflection on the early Islamic period.', submissions: 1, totalStudents: 5, grade: null, feedback: '' },
      { _id: 'hw5', title: 'Hifz Page 12 Review', subject: 'Hifz', type: 'memorization', deadline: new Date(now - 3 * DAY).toISOString(), status: 'late', points: 10, description: 'Review and be able to recite page 12 from memory.', submissions: 0, totalStudents: 5, grade: null, feedback: '' },
    ];
  }
}

/* ── Create Assignment modal ────────────────────────────────────── */
function CreateModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    title: '', subject: 'Quran', type: 'written', deadline: '',
    points: 10, description: '',
  });

  const fieldStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border-default)',
    borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)',
    fontSize: '0.85rem', fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-modal="true" aria-label="Create assignment">
      <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>New Assignment</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Title', key: 'title', type: 'text', placeholder: 'Assignment title' },
            { label: 'Description', key: 'description', type: 'textarea', placeholder: 'Instructions for students…' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
              {type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              ) : (
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={fieldStyle}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Subject</label>
              <select value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} style={fieldStyle}>
                {['Quran','Arabic','Tajweed','Hifz','Islamic Studies'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={fieldStyle}>
                {['written','memorization','essay','quiz','project'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Deadline</label>
              <input type="datetime-local" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} style={fieldStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Points</label>
              <input type="number" min={1} max={100} value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))} style={fieldStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Cancel</button>
          <button onClick={() => { onSave(form); onClose(); }} disabled={!form.title || !form.deadline} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: !form.title || !form.deadline ? 0.5 : 1 }}>Assign</button>
        </div>
      </div>
    </div>
  );
}

/* ── Submit homework modal (student) ────────────────────────────── */
function SubmitModal({ hw, onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const fileRef = useRef();
  const [file, setFile] = useState(null);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-modal="true" aria-label="Submit homework">
      <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Submit: {hw.title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes (optional)</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes for your teacher…"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: '2px dashed var(--border-default)', borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16, background: file ? 'var(--bg-page)' : 'transparent' }}
        >
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0])} />
          {file ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              <Paperclip size={15} aria-hidden="true" /> {file.name}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              <Upload size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.5 }} aria-hidden="true" />
              Click to attach a file
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Cancel</button>
          <button
            onClick={() => { onSubmit({ hwId: hw._id, notes, file }); onClose(); }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
          >
            <Send size={13} aria-hidden="true" /> Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Assignment card ────────────────────────────────────────────── */
function AssignmentCard({ hw, isTeacher, onSubmit, onGrade }) {
  const [expanded, setExpanded] = useState(false);
  const [gradeVal, setGradeVal] = useState(hw.grade ?? '');
  const [feedbackVal, setFeedbackVal] = useState(hw.feedback ?? '');
  const isOverdue = hw.status !== 'graded' && hw.status !== 'submitted' && new Date(hw.deadline) < new Date();
  const effectiveStatus = isOverdue ? 'overdue' : hw.status;

  return (
    <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Card header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', fontFamily: 'var(--font-sans)' }}
        aria-expanded={expanded}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={18} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{hw.title}</span>
              {statusBadge(effectiveStatus)}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <BookOpen size={11} aria-hidden="true" /> {hw.subject}
              </span>
              <span style={{ fontSize: '0.75rem', color: deadlineColor(hw.deadline), fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Calendar size={11} aria-hidden="true" /> {formatDeadline(hw.deadline)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Star size={11} aria-hidden="true" /> {hw.points} pts
              </span>
              {isTeacher && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {hw.submissions}/{hw.totalStudents} submitted
                </span>
              )}
              {hw.grade !== null && hw.grade !== undefined && (
                <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                  Score: {hw.grade}/{hw.points}
                </span>
              )}
            </div>
          </div>

          <div style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>{hw.description}</p>

          {/* Feedback if graded */}
          {hw.status === 'graded' && hw.feedback && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#15803d', fontSize: '0.78rem', marginBottom: 4 }}>
                <MessageSquare size={12} aria-hidden="true" /> Teacher Feedback
              </div>
              <p style={{ margin: 0, color: '#166534', fontSize: '0.85rem' }}>{hw.feedback}</p>
            </div>
          )}

          {/* Student: submit button */}
          {!isTeacher && hw.status === 'pending' && !isOverdue && (
            <button
              onClick={() => onSubmit(hw)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <Upload size={13} aria-hidden="true" /> Submit Work
            </button>
          )}

          {/* Student: submitted state */}
          {!isTeacher && hw.status === 'submitted' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb', fontSize: '0.82rem', fontWeight: 700 }}>
              <Check size={14} aria-hidden="true" /> Submitted — awaiting grading
            </div>
          )}

          {/* Teacher: grade input */}
          {isTeacher && hw.status !== 'graded' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>Score (/{hw.points})</label>
                <input
                  type="number" min={0} max={hw.points}
                  value={gradeVal}
                  onChange={(e) => setGradeVal(e.target.value)}
                  style={{ width: 80, padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>Feedback</label>
                <input
                  type="text"
                  value={feedbackVal}
                  onChange={(e) => setFeedbackVal(e.target.value)}
                  placeholder="Optional feedback…"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={() => onGrade({ hwId: hw._id, grade: Number(gradeVal), feedback: feedbackVal })}
                disabled={gradeVal === ''}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: gradeVal === '' ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: gradeVal === '' ? 0.5 : 1 }}
              >
                <Check size={12} aria-hidden="true" /> Grade
              </button>
            </div>
          )}

          {/* Teacher: view submissions link */}
          {isTeacher && (
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, color: hw.submissions > 0 ? '#2563eb' : 'var(--text-secondary)' }}>{hw.submissions}</span> / {hw.totalStudents} students submitted
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   HomeworkPage
   ════════════════════════════════════════════════════════════════ */
export default function HomeworkPage() {
  const { isTeacher } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState(null);
  const [filter, setFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const role = isTeacher ? 'teacher' : 'student';

  const { data: homework = [], isLoading } = useQuery({
    queryKey: ['homework', role],
    queryFn: () => fetchHomework(role),
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (form) => {
      try {
        const { default: http } = await import('../api/http');
        await http.post('/api/homework', form);
      } catch { /* demo noop */ }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework'] }),
  });

  const submitMutation = useMutation({
    mutationFn: async ({ hwId, notes }) => {
      try {
        const { default: http } = await import('../api/http');
        await http.post(`/api/homework/${hwId}/submit`, { notes });
      } catch { /* demo noop */ }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework'] }),
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ hwId, grade, feedback }) => {
      try {
        const { default: http } = await import('../api/http');
        await http.post(`/api/homework/${hwId}/grade`, { grade, feedback });
      } catch { /* demo noop */ }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework'] }),
  });

  /* Stats */
  const stats = useMemo(() => {
    const total    = homework.length;
    const pending  = homework.filter((h) => h.status === 'pending').length;
    const graded   = homework.filter((h) => h.status === 'graded').length;
    const overdue  = homework.filter((h) => h.status !== 'graded' && h.status !== 'submitted' && new Date(h.deadline) < new Date()).length;
    return { total, pending, graded, overdue };
  }, [homework]);

  /* Subjects */
  const subjects = useMemo(() => ['all', ...new Set(homework.map((h) => h.subject))], [homework]);

  /* Filtered list */
  const filtered = useMemo(() => {
    return homework.filter((h) => {
      const isOverdue = h.status !== 'graded' && h.status !== 'submitted' && new Date(h.deadline) < new Date();
      const effectiveStatus = isOverdue ? 'overdue' : h.status;
      if (filter !== 'all' && effectiveStatus !== filter) return false;
      if (subjectFilter !== 'all' && h.subject !== subjectFilter) return false;
      return true;
    }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }, [homework, filter, subjectFilter]);

  const STATUS_FILTERS = ['all','pending','submitted','graded','overdue'];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
              {isTeacher ? 'Assignments' : 'Homework'}
            </h1>
            <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {isTeacher ? 'Manage and grade student assignments' : 'View and submit your homework'}
            </p>
          </div>
          {isTeacher && (
            <button
              onClick={() => setCreateOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <Plus size={14} aria-hidden="true" /> New Assignment
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total',    value: stats.total,   color: '#2176c7', Icon: FileText },
            { label: 'Pending',  value: stats.pending, color: '#d97706', Icon: Clock },
            { label: 'Graded',   value: stats.graded,  color: '#16a34a', Icon: Check },
            { label: 'Overdue',  value: stats.overdue, color: '#dc2626', Icon: AlertCircle },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="ds-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} style={{ color }} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, marginTop: 1 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 12px', borderRadius: 99,
                  border: '1px solid var(--border-default)',
                  background: filter === f ? 'var(--color-primary)' : 'var(--bg-surface)',
                  color: filter === f ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', textTransform: 'capitalize',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.78rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', marginLeft: 'auto' }}
            aria-label="Filter by subject"
          >
            {subjects.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Subjects' : s}</option>)}
          </select>
        </div>

        {/* Assignments list */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(3)].map((_,i) => <div key={i} className="ds-skel" style={{ height: 80, borderRadius: 12 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} aria-hidden="true" />
            <div style={{ fontWeight: 600 }}>No assignments found</div>
            <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
              {filter !== 'all' ? 'Try changing the filter' : isTeacher ? 'Create your first assignment above' : 'You\'re all caught up!'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((hw) => (
              <AssignmentCard
                key={hw._id}
                hw={hw}
                isTeacher={isTeacher}
                onSubmit={setSubmitTarget}
                onGrade={(data) => gradeMutation.mutate(data)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSave={(form) => createMutation.mutate(form)}
        />
      )}
      {submitTarget && (
        <SubmitModal
          hw={submitTarget}
          onClose={() => setSubmitTarget(null)}
          onSubmit={(data) => submitMutation.mutate(data)}
        />
      )}
    </DashboardLayout>
  );
}
