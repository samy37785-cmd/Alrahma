// Shared date/time formatters (Phase 4.2). Before this, five pages carried
// local copies of these — three distinct fmtDate variants plus identical
// fmtTime/minutesUntil pairs. The variants are deliberate (list rows want
// "12 Mar", records want the year, teacher follow-ups want date · time), so
// each is exported under an explicit name rather than forced into one shape.

/** "12 Mar" — compact day+month for feed/list rows. */
export function formatDayMonth(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "12 Mar 2026" — full date for records and history. */
export function formatFullDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "12 Mar 2026 · 14:30" — appends the time only when one is actually set. */
export function formatDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (dt.getHours() || dt.getMinutes())
    ? `${date} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : date;
}

/** "14:30" in the user's locale; empty string on falsy input. */
export function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Whole minutes from now until `d`, floored at 0. */
export function minutesUntil(d) {
  return Math.max(0, Math.round((new Date(d) - Date.now()) / 60000));
}
