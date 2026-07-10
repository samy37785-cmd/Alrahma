/**
 * AttendancePage — GitHub-style contribution heatmap + detailed attendance log.
 * Teachers can mark attendance; students/parents view-only.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import PreviewBanner from '../components/ui/PreviewBanner';
import { useAuth } from '../context/AuthContext';
import {
  Check, X, Clock, AlertCircle, TrendingUp, Calendar, Users,
  Download, ChevronLeft, ChevronRight, RefreshCw, CheckSquare,
} from 'lucide-react';

/* ── Constants ──────────────────────────────────────────────────── */
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT   = ['S','M','T','W','T','F','S'];

const STATUS = {
  present: { color: '#16a34a', bg: '#dcfce7', label: 'Present',  icon: Check },
  absent:  { color: '#dc2626', bg: '#fee2e2', label: 'Absent',   icon: X },
  late:    { color: '#d97706', bg: '#fef3c7', label: 'Late',     icon: Clock },
  excused: { color: '#6366f1', bg: '#eef2ff', label: 'Excused',  icon: AlertCircle },
  none:    { color: 'var(--border-subtle)', bg: 'var(--bg-page)', label: 'No session', icon: null },
};

function heatColor(status, count = 1) {
  if (!status || status === 'none') return 'var(--border-subtle)';
  const base = STATUS[status]?.color || STATUS.none.color;
  if (status === 'present') {
    const opacity = Math.min(0.3 + count * 0.35, 1);
    return `rgba(22,163,74,${opacity})`;
  }
  return base;
}

/* ── API ────────────────────────────────────────────────────────── */
async function fetchAttendance(studentId) {
  try {
    const { default: http } = await import('../api/http');
    const url = studentId ? `/api/attendance?student=${studentId}` : '/api/attendance/me';
    const res = await http.get(url);
    return res.data?.records ?? res.data ?? [];
  } catch {
    // Demo data
    const records = [];
    const now = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // no weekend sessions
      if (Math.random() < 0.35) continue;  // ~35% no session days
      const r = Math.random();
      records.push({
        _id: `demo-${i}`,
        date: d.toISOString(),
        status: r < 0.78 ? 'present' : r < 0.88 ? 'late' : r < 0.95 ? 'excused' : 'absent',
        subject: ['Quran','Arabic','Tajweed','Hifz'][Math.floor(Math.random() * 4)],
        teacher: 'Sheikh Omar',
        notes: '',
      });
    }
    return records;
  }
}

async function fetchStudents() {
  try {
    const { default: http } = await import('../api/http');
    const res = await http.get('/api/attendance/students');
    return res.data?.students ?? res.data ?? [];
  } catch {
    return [
      { _id: 's1', name: 'Ahmed Hassan',   email: 'ahmed@example.com', rate: 92 },
      { _id: 's2', name: 'Fatima Ali',     email: 'fatima@example.com', rate: 87 },
      { _id: 's3', name: 'Omar Khaled',    email: 'omar@example.com', rate: 76 },
      { _id: 's4', name: 'Aisha Mahmoud',  email: 'aisha@example.com', rate: 95 },
      { _id: 's5', name: 'Youssef Samy',   email: 'youssef@example.com', rate: 68 },
    ];
  }
}

/* ── Heatmap grid ───────────────────────────────────────────────── */
function AttendanceHeatmap({ records }) {
  const [tooltip, setTooltip] = useState(null);

  const { grid, monthLabels } = useMemo(() => {
    const end   = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay()); // align to Sunday

    const byDate = {};
    records.forEach((r) => {
      const key = new Date(r.date).toDateString();
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    });

    const weeks = [];
    const labels = [];
    let cur = new Date(start);

    while (cur <= end) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const key = cur.toDateString();
        const recs = byDate[key] || [];
        const status = recs.length === 0 ? 'none'
          : recs.every((r) => r.status === 'present') ? 'present'
          : recs.some((r) => r.status === 'absent')   ? 'absent'
          : recs.some((r) => r.status === 'late')     ? 'late'
          : 'excused';
        week.push({ date: new Date(cur), status, recs });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    // Month labels
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const m = week[0].date.getMonth();
      if (m !== lastMonth) {
        labels.push({ weekIndex: wi, label: MONTHS_SHORT[m] });
        lastMonth = m;
      }
    });

    return { grid: weeks, monthLabels: labels };
  }, [records]);

  const CELL = 13, GAP = 2;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Month labels */}
        <div style={{ display: 'flex', marginLeft: 24, marginBottom: 4, height: 14, position: 'relative' }}>
          {monthLabels.map(({ weekIndex, label }) => (
            <div
              key={label + weekIndex}
              style={{ position: 'absolute', left: weekIndex * (CELL + GAP), fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}
            >
              {label}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: GAP }}>
          {/* Day labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 2 }}>
            {DAYS_SHORT.map((d, i) => (
              <div key={i} style={{ width: CELL, height: CELL, fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>

          {/* Heatmap cells */}
          {grid.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              {week.map((cell, di) => (
                <div
                  key={di}
                  onMouseEnter={(e) => setTooltip({ cell, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    width: CELL, height: CELL, borderRadius: 2,
                    background: heatColor(cell.status, cell.recs.length),
                    cursor: cell.recs.length > 0 ? 'pointer' : 'default',
                    transition: 'transform 0.1s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                  onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  role={cell.recs.length > 0 ? 'button' : undefined}
                  aria-label={cell.recs.length > 0 ? `${cell.date.toDateString()}: ${cell.status}` : undefined}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Less</span>
          {['none','present','present','present'].map((s, i) => (
            <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: heatColor(s, i) }} />
          ))}
          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>More</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && tooltip.cell.recs.length > 0 && (
        <div style={{
          position: 'fixed', zIndex: 9999, pointerEvents: 'none',
          left: tooltip.x + 12, top: tooltip.y - 60,
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 8, padding: '8px 12px', boxShadow: 'var(--shadow-md)',
          fontSize: '0.75rem', color: 'var(--text-primary)', minWidth: 140,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.cell.date.toDateString()}</div>
          {tooltip.cell.recs.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[r.status]?.color, flexShrink: 0 }} />
              <span>{r.subject} — <strong>{r.status}</strong></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Attendance stat card ───────────────────────────────────────── */
function StatCard({ label, value, sub, color, Icon }) {
  return (
    <div className="ds-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color }} aria-hidden="true" />
      </div>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, lineHeight: 1.2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.68rem', color, fontWeight: 700 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Mark attendance modal (teacher) ────────────────────────────── */
function MarkModal({ students, onClose, onSave }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState('Quran');
  const [marks, setMarks] = useState({});

  const fieldStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border-default)',
    borderRadius: 8, background: 'var(--bg-page)', color: 'var(--text-primary)',
    fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-modal="true" aria-label="Mark attendance">
      <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-xl)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }}>Mark Attendance</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={fieldStyle}>
              {['Quran','Arabic','Tajweed','Hifz','Islamic Studies'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4,auto)', padding: '8px 14px', background: 'var(--bg-page)', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', gap: 8 }}>
            <span>Student</span>
            {['present','late','excused','absent'].map(s => <span key={s} style={{ color: STATUS[s].color }}>{s}</span>)}
          </div>
          {students.map((st) => (
            <div key={st._id} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4,auto)', padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{st.name}</span>
              {['present','late','excused','absent'].map((s) => (
                <button
                  key={s}
                  onClick={() => setMarks((m) => ({ ...m, [st._id]: s }))}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: `2px solid ${marks[st._id] === s ? STATUS[s].color : 'var(--border-default)'}`,
                    background: marks[st._id] === s ? STATUS[s].bg : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label={`Mark ${st.name} as ${s}`}
                  aria-pressed={marks[st._id] === s}
                >
                  {marks[st._id] === s && (() => { const Icon = STATUS[s].icon; return <Icon size={12} style={{ color: STATUS[s].color }} />; })()}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Cancel</button>
          <button onClick={() => { onSave({ date, subject, marks }); onClose(); }} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Save Attendance</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   AttendancePage
   ════════════════════════════════════════════════════════════════ */
export default function AttendancePage() {
  const { isTeacher } = useAuth();
  const queryClient = useQueryClient();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [markOpen, setMarkOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const { data: students = [] } = useQuery({
    queryKey: ['attendance-students'],
    queryFn: fetchStudents,
    enabled: isTeacher,
  });

  const activeStudent = isTeacher ? selectedStudent : null;

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['attendance-records', activeStudent],
    queryFn: () => fetchAttendance(activeStudent),
    staleTime: 2 * 60 * 1000,
  });

  // No /api/attendance/* backend exists yet (see the preview banner below) —
  // this still calls the real endpoint it's named for, so wiring one up later
  // needs no frontend changes, but it no longer swallows the failure and
  // pretends it succeeded.
  const saveMutation = useMutation({
    mutationFn: async ({ date, subject, marks }) => {
      const { default: http } = await import('../api/http');
      await http.post('/api/attendance/bulk', { date, subject, marks });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance-records'] }),
  });

  /* Stats */
  const stats = useMemo(() => {
    const total   = records.length;
    const present = records.filter((r) => r.status === 'present').length;
    const absent  = records.filter((r) => r.status === 'absent').length;
    const late    = records.filter((r) => r.status === 'late').length;
    const rate    = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, rate };
  }, [records]);

  /* Paginated log */
  const sortedRecords = useMemo(() =>
    [...records].sort((a, b) => new Date(b.date) - new Date(a.date)),
  [records]);
  const pageRecords = sortedRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages  = Math.ceil(sortedRecords.length / PAGE_SIZE);

  function exportCsv() {
    const header = 'Date,Subject,Status,Teacher,Notes';
    const rows = records.map((r) =>
      `${new Date(r.date).toLocaleDateString()},${r.subject},${r.status},${r.teacher},"${r.notes}"`
    );
    const csv = [header, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'attendance.csv';
    a.click();
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <PreviewBanner>
          Preview — the attendance history, student roster, and rates below are illustrative. Marking attendance isn&apos;t connected to a real backend yet, so nothing is actually saved.
        </PreviewBanner>

        {saveMutation.isError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
            borderRadius: 10, marginBottom: 18, fontSize: '0.82rem', color: 'var(--color-danger-text)',
          }} role="alert">
            <span style={{ flex: 1 }}>Attendance wasn&apos;t saved — this page is a preview.</span>
            <button
              type="button"
              onClick={() => saveMutation.reset()}
              style={{ background: 'none', border: 'none', color: 'var(--color-danger-text)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-sans)' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>Attendance</h1>
            <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Track session presence over time</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isTeacher && (
              <button onClick={() => setMarkOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                <CheckSquare size={14} aria-hidden="true" /> Mark Attendance
              </button>
            )}
            <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
              <Download size={13} aria-hidden="true" /> Export
            </button>
          </div>
        </div>

        {/* Teacher: student selector */}
        {isTeacher && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              onClick={() => setSelectedStudent(null)}
              style={{ padding: '6px 14px', borderRadius: 99, border: '1px solid var(--border-default)', background: !selectedStudent ? 'var(--color-primary)' : 'var(--bg-surface)', color: !selectedStudent ? '#fff' : 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              My Overview
            </button>
            {students.map((s) => (
              <button
                key={s._id}
                onClick={() => setSelectedStudent(s._id)}
                style={{ padding: '6px 14px', borderRadius: 99, border: '1px solid var(--border-default)', background: selectedStudent === s._id ? 'var(--color-primary)' : 'var(--bg-surface)', color: selectedStudent === s._id ? '#fff' : 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 20 }}>
          <StatCard label="Attendance Rate" value={`${stats.rate}%`} sub={stats.rate >= 85 ? 'Excellent' : stats.rate >= 70 ? 'Good' : 'Needs improvement'} color={stats.rate >= 85 ? '#16a34a' : stats.rate >= 70 ? '#d97706' : '#dc2626'} Icon={TrendingUp} />
          <StatCard label="Present" value={stats.present} sub={`of ${stats.total} sessions`} color="#16a34a" Icon={Check} />
          <StatCard label="Absent" value={stats.absent} color="#dc2626" Icon={X} />
          <StatCard label="Late" value={stats.late} color="#d97706" Icon={Clock} />
        </div>

        {/* Heatmap */}
        <div className="ds-card" style={{ padding: 20, marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 14px', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            Attendance over the last year
          </h2>
          {isLoading ? (
            <div className="ds-skel" style={{ height: 100, borderRadius: 8 }} />
          ) : (
            <AttendanceHeatmap records={records} />
          )}

          {/* Status legend */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            {Object.entries(STATUS).filter(([k]) => k !== 'none').map(([key, val]) => {
              const Icon = val.icon;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: val.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {Icon && <Icon size={8} color="#fff" aria-hidden="true" />}
                  </span>
                  {val.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed log */}
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Session Log</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{records.length} records</span>
          </div>

          {isLoading ? (
            <div style={{ padding: 20 }}>
              {[...Array(5)].map((_,i) => <div key={i} className="ds-skel" style={{ height: 40, borderRadius: 8, marginBottom: 8 }} />)}
            </div>
          ) : pageRecords.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Calendar size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} aria-hidden="true" />
              <div style={{ fontWeight: 600 }}>No attendance records yet</div>
            </div>
          ) : (
            <>
              <div className="ds-table-wrap">
                <table className="ds-table" aria-label="Attendance records">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Subject</th>
                      <th>Teacher</th>
                      <th>Status</th>
                      {isTeacher && <th>Notes</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRecords.map((r) => {
                      const st = STATUS[r.status] || STATUS.none;
                      const Icon = st.icon;
                      return (
                        <tr key={r._id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {new Date(r.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{r.subject}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{r.teacher}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: st.bg, color: st.color, padding: '3px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${st.color}33` }}>
                              {Icon && <Icon size={10} aria-hidden="true" />}
                              {st.label}
                            </span>
                          </td>
                          {isTeacher && <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{r.notes || '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, records.length)} of {records.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Previous page" style={{ width: 30, height: 30, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)', cursor: page === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: page === 0 ? 0.4 : 1 }}>
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} aria-label="Next page" style={{ width: 30, height: 30, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Teacher: students overview table */}
        {isTeacher && students.length > 0 && (
          <div className="ds-card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                <Users size={15} style={{ display: 'inline', marginRight: 6 }} aria-hidden="true" />
                Students Overview
              </h2>
            </div>
            <div className="ds-table-wrap">
              <table className="ds-table" aria-label="Students attendance overview">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Rate</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const color = s.rate >= 85 ? '#16a34a' : s.rate >= 70 ? '#d97706' : '#dc2626';
                    const label = s.rate >= 85 ? 'On track' : s.rate >= 70 ? 'Needs attention' : 'At risk';
                    return (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--bg-page)', overflow: 'hidden' }}>
                              <div style={{ width: `${s.rate}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s' }} />
                            </div>
                            <span style={{ fontWeight: 700, color, fontSize: '0.85rem', minWidth: 38 }}>{s.rate}%</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-block', background: `${color}22`, color, padding: '3px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{label}</span>
                        </td>
                        <td>
                          <button onClick={() => setSelectedStudent(s._id)} style={{ color: 'var(--text-brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', fontFamily: 'var(--font-sans)' }}>
                            View details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Mark attendance modal */}
      {markOpen && (
        <MarkModal
          students={students}
          onClose={() => setMarkOpen(false)}
          onSave={(data) => saveMutation.mutate(data)}
        />
      )}
    </DashboardLayout>
  );
}
