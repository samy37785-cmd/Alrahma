import { describe, it, expect } from 'vitest';
import { inferSessionType, platformFromUrl, mapLiveClassToEvent } from '../utils/calendarHelpers';

// Learning Experience Sprint 3: CalendarPage.jsx used to call a nonexistent
// /api/sessions endpoint and silently fall back to randomly-regenerated fake
// sessions/teachers on every request, with a dead "Join Session" link. It now
// consumes the real, already-working /api/classes (LiveClass) endpoint. That
// model has no subject-type/platform fields, so this covers the derivation
// logic that keeps the existing color legend and "Join Session" link
// meaningful without inventing data.

describe('inferSessionType', () => {
  it('infers from keywords in the title, case-insensitively', () => {
    expect(inferSessionType('Tajweed Practice')).toBe('tajweed');
    expect(inferSessionType('HIFZ Review')).toBe('hifz');
    expect(inferSessionType('Memorization session')).toBe('hifz');
    expect(inferSessionType('Arabic Grammar')).toBe('arabic');
    expect(inferSessionType('Islamic Studies intro')).toBe('islamic_studies');
    expect(inferSessionType('Quran recitation')).toBe('quran');
  });

  it('returns null (neutral default palette) when nothing matches', () => {
    expect(inferSessionType('General check-in')).toBeNull();
    expect(inferSessionType('')).toBeNull();
    expect(inferSessionType(undefined)).toBeNull();
  });
});

describe('platformFromUrl', () => {
  it('recognizes common meeting providers', () => {
    expect(platformFromUrl('https://zoom.us/j/12345')).toBe('Zoom');
    expect(platformFromUrl('https://meet.google.com/abc-defg-hij')).toBe('Google Meet');
    expect(platformFromUrl('https://teams.microsoft.com/l/meetup-join/x')).toBe('Microsoft Teams');
    expect(platformFromUrl('https://meet.jit.si/room')).toBe('Jitsi');
  });

  it('falls back to a generic label for an unrecognized provider', () => {
    expect(platformFromUrl('https://example.com/room')).toBe('Video call');
  });

  it('returns an empty string when there is no meeting URL', () => {
    expect(platformFromUrl('')).toBe('');
    expect(platformFromUrl(undefined)).toBe('');
  });
});

describe('mapLiveClassToEvent', () => {
  it('maps a real LiveClass API object to the event shape the calendar views expect', () => {
    const liveClass = {
      _id: 'c1',
      title: 'Tajweed Practice',
      teacher: { name: 'Ustadh Ahmed', email: 'a@example.com' },
      startsAt: '2026-01-01T10:00:00.000Z',
      durationMin: 45,
      meetingUrl: 'https://zoom.us/j/999',
      status: 'scheduled',
    };

    const ev = mapLiveClassToEvent(liveClass);

    expect(ev._id).toBe('c1');
    expect(ev.title).toBe('Tajweed Practice');
    expect(ev.type).toBe('tajweed');
    expect(ev.teacher).toBe('Ustadh Ahmed');
    expect(ev.status).toBe('scheduled');
    expect(ev.platform).toBe('Zoom');
    expect(ev.meetingUrl).toBe('https://zoom.us/j/999');
    expect(ev.start).toBe('2026-01-01T10:00:00.000Z');
    expect(new Date(ev.end) - new Date(ev.start)).toBe(45 * 60000);
  });

  it('defaults durationMin to 30 minutes when absent', () => {
    const ev = mapLiveClassToEvent({ _id: 'c2', title: 'x', startsAt: '2026-01-01T10:00:00.000Z', status: 'scheduled' });
    expect(new Date(ev.end) - new Date(ev.start)).toBe(30 * 60000);
  });

  it('handles a missing teacher without throwing', () => {
    const ev = mapLiveClassToEvent({ _id: 'c3', title: 'x', startsAt: '2026-01-01T10:00:00.000Z', status: 'scheduled' });
    expect(ev.teacher).toBe('');
  });
});
