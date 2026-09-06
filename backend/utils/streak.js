// Shared daily-streak bookkeeping for per-user Quran progress records
// (QuranReadingProgress, QuranMemorizationStats). Dates are compared as
// local 'YYYY-MM-DD' strings (not Date objects) to avoid timezone drift
// when a user logs activity near midnight.

export const todayStr = () => new Date().toISOString().slice(0, 10);

function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b) - new Date(a)) / msPerDay);
}

// Advances a { current, longest, lastReadDate } streak object in place for
// an activity logged "today". Same-day repeats are a no-op; a gap of more
// than one day resets the streak to 1.
export function applyStreak(streak, today = todayStr()) {
  const s = streak || { current: 0, longest: 0, lastReadDate: '' };
  if (s.lastReadDate === today) {
    return s;
  }
  const diff = s.lastReadDate ? daysBetween(s.lastReadDate, today) : null;
  s.current = diff === 1 ? s.current + 1 : 1;
  s.longest = Math.max(s.longest || 0, s.current);
  s.lastReadDate = today;
  return s;
}
