import { useState, useEffect } from 'react';
import {
  getUserHifzReport, getUserCourseProgress,
  listCertificates, issueCertificate, revokeCertificate,
} from '../../../api/client';

const EMPTY_CERT = { type: 'completion', title: '', grade: '', notes: '' };

export default function AdminProgressModal({ user, onClose, onError }) {
  const [report, setReport] = useState(null);
  const [certs, setCerts] = useState([]);
  const [certForm, setCertForm] = useState(EMPTY_CERT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUserHifzReport(user._id).catch(() => []),
      getUserCourseProgress(user._id).catch(() => []),
      listCertificates(user._id).catch(() => []),
    ]).then(([hifz, courses, userCerts]) => {
      setReport({ hifz, courses });
      setCerts(userCerts);
    }).finally(() => setLoading(false));
  }, [user._id]);

  const handleIssueCert = async (e) => {
    e.preventDefault();
    if (!certForm.title.trim()) return;
    try {
      const cert = await issueCertificate({ userId: user._id, ...certForm });
      setCerts((prev) => [cert, ...prev]);
      setCertForm(EMPTY_CERT);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not issue certificate');
    }
  };

  const handleRevokeCert = async (id) => {
    if (!confirm('Revoke this certificate?')) return;
    try {
      await revokeCertificate(id);
      setCerts((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      onError(err.response?.data?.message || 'Could not revoke certificate');
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 640, width: '92%' }}>
        <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        <h3 className="modal__title" style={{ marginBottom: 4 }}>📊 {user.name}</h3>
        <p style={{ color: '#888', fontSize: '.85rem', marginTop: 0 }}>{user.email}</p>

        {loading ? (
          <p className="admin__empty">Loading report…</p>
        ) : (
          <>
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
                <input value={certForm.title} placeholder="e.g. Ijazah in Hafs 'an 'Asim" required onChange={(e) => setCertForm((f) => ({ ...f, title: e.target.value }))} />
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
  );
}
