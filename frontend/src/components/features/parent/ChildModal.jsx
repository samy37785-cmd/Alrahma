import { useQuery } from '@tanstack/react-query';
import { Brain, ClipboardList, GraduationCap } from 'lucide-react';
import { getChildDetail } from '../../../api/parentApi';
import ProgressRing from '../../ui/ProgressRing';
import { getNameInitials } from '../../../utils/nameInitials';
import { formatFullDate as fmtDate } from '../../../utils/date';
function attendBadge(a) {
  if (a === 'present') return 'ds-badge--green';
  if (a === 'absent')  return 'ds-badge--red';
  if (a === 'late')    return 'ds-badge--yellow';
  return 'ds-badge--gray';
}

/* ── Child detail modal ──────────────────────────────────────── */
export default function ChildModal({ childId, childList, L, onClose }) {
  const { data: detail, isLoading, error: detailError } = useQuery({
    queryKey: ['parent', 'child', childId],
    queryFn:  () => getChildDetail(childId),
    enabled:  !!childId,
    staleTime: 60000,
  });
  const child = childList.find((c) => c._id === childId);
  const initials = getNameInitials(child?.name) || '?';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(3px)', zIndex: 'var(--z-modal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)', borderRadius: 16,
          width: '100%', maxWidth: 620, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--grad-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{child?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {child?.email} · {child?.recordCount || 0} records · {child?.memorizedVerses || 0} verses
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border-default)', background: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {detailError ? (
            <p style={{ color: 'var(--color-danger)', margin: '20px 0', fontSize: '0.875rem' }}>Failed to load details</p>
          ) : isLoading || !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="ds-spinner" /></div>
          ) : (
            <>
              {/* Follow-up records */}
              <h4 style={{ margin: '18px 0 10px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClipboardList size={14} aria-hidden="true" /> {L.history} ({detail.records.length})
              </h4>
              {detail.records.length === 0 ? (
                <div className="ds-empty" style={{ padding: '14px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 36, height: 36, fontSize: '0.9rem' }}>📋</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>{L.noRecords}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.records.map((r) => (
                    <div key={r._id} style={{ background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: 9, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmtDate(r.date)}</span>
                        {r.teacher?.name && <span className="ds-badge ds-badge--blue">{L.by} {r.teacher.name}</span>}
                        {r.grade != null && <span className="ds-badge ds-badge--green">{r.grade}/100</span>}
                        {r.gradeLabel && <span className="ds-badge ds-badge--gray">{r.gradeLabel}</span>}
                        {r.attendance && <span className={`ds-badge ${attendBadge(r.attendance)}`}>{r.attendance}</span>}
                        {r.course && <span className="ds-badge ds-badge--gray">{r.course.icon} {r.course.title}</span>}
                      </div>
                      {r.note && <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.note}</p>}
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
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{c.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 8 }}>{c.done}/{c.total}</span>
                        </div>
                        <div className="ds-bar"><div className="ds-bar__fill" style={{ width: `${c.percent}%` }} /></div>
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
                    <div key={h._id} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--color-success-surface)', border: '1px solid var(--color-success-border)', fontSize: '0.78rem' }}>
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
   MAIN
   ══════════════════════════════════════════════════════════════════ */
