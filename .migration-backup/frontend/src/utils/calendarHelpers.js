// LiveClass has no subject-type field — infer one from the free-text title
// so the existing color legend stays meaningful without inventing data;
// falls back to the neutral default palette when nothing matches.
export function inferSessionType(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('tajweed'))                       return 'tajweed';
  if (t.includes('hifz') || t.includes('memoriz')) return 'hifz';
  if (t.includes('arabic'))                        return 'arabic';
  if (t.includes('islamic'))                       return 'islamic_studies';
  if (t.includes('quran') || t.includes('koran'))  return 'quran';
  return null;
}

export function platformFromUrl(url) {
  if (!url) return '';
  if (/zoom\.us/i.test(url))              return 'Zoom';
  if (/meet\.google\.com/i.test(url))     return 'Google Meet';
  if (/teams\.microsoft\.com/i.test(url)) return 'Microsoft Teams';
  if (/jit\.si/i.test(url))               return 'Jitsi';
  return 'Video call';
}

export function mapLiveClassToEvent(c) {
  const start = c.startsAt;
  const end = new Date(new Date(c.startsAt).getTime() + (c.durationMin || 30) * 60000).toISOString();
  return {
    _id: c._id,
    title: c.title,
    type: inferSessionType(c.title),
    start,
    end,
    teacher: c.teacher?.name || '',
    status: c.status, // 'scheduled' | 'cancelled' | 'completed' — LiveClass has no 'absent' state
    platform: platformFromUrl(c.meetingUrl),
    meetingUrl: c.meetingUrl,
  };
}
