// Shared by pages whose data has no real backend yet (Homework, Attendance) —
// makes that fact visible to the user instead of letting fabricated-looking
// data (assignments, grades, attendance records) pass as real. Reused rather
// than duplicated so both pages carry the same wording/visual treatment.
export default function PreviewBanner({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
      background: 'var(--color-warning-surface)', border: '1px solid var(--color-warning-border)',
      borderRadius: 10, marginBottom: 18, fontSize: '0.82rem', color: 'var(--color-warning-text)',
    }}>
      <span aria-hidden="true">🧪</span>
      <span>{children}</span>
    </div>
  );
}
