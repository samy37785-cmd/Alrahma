// WhatsApp support hours, Cairo time (TrustBar): Saturday to Thursday, 08:00-23:00,
// Friday closed. These are the same hours footer.supportHours states and
// TermsOfService.jsx §13 documents; this file only computes them, it does not set them.
//
// The wall-clock reading uses Intl with the named zone 'Africa/Cairo', never a fixed
// UTC offset, so Egypt's daylight-saving switches are handled by the platform's tz data.
// If Intl cannot resolve the zone, supportStatusAt() returns 'unknown' and TrustBar keeps
// its neutral, time-free text instead of claiming either state.

export const SUPPORT_TIME_ZONE = 'Africa/Cairo';
const OPEN_HOUR = 8;
const CLOSE_HOUR = 23;
const CLOSED_DAY = 'Fri';

let formatter;
function cairoFormatter() {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: SUPPORT_TIME_ZONE, weekday: 'short', hour: 'numeric', hourCycle: 'h23',
    });
  }
  return formatter;
}

// { weekday: 'Sun'..'Sat', hour: 0..23 } in Cairo, or null if Intl cannot tell.
export function cairoWallClock(date) {
  try {
    const parts = cairoFormatter().formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    if (!weekday || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    return { weekday, hour };
  } catch {
    return null;
  }
}

// 'online' | 'offline' | 'unknown'
export function supportStatusAt(date) {
  const now = cairoWallClock(date);
  if (!now) return 'unknown';
  return now.weekday !== CLOSED_DAY && now.hour >= OPEN_HOUR && now.hour < CLOSE_HOUR ? 'online' : 'offline';
}

// The status can only change on a Cairo hour boundary. Egypt's offset is a whole number
// of hours (UTC+2 or UTC+3), so those boundaries fall on UTC hour boundaries; the next
// check is scheduled for just after the next one.
const HOUR_MS = 60 * 60 * 1000;
export function msUntilNextCheck(date) {
  return HOUR_MS - (date.getTime() % HOUR_MS) + 1000;
}
