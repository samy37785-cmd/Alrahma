export function safeInternalDestination(candidate, fallback = '/') {
  if (!candidate) return fallback;

  const raw = typeof candidate === 'string'
    ? candidate
    : `${candidate.pathname || ''}${candidate.search || ''}${candidate.hash || ''}`;

  if (
    !raw.startsWith('/')
    || raw.startsWith('//')
    || raw.includes('\\')
    || /%5c/i.test(raw)
  ) {
    return fallback;
  }

  try {
    const origin = typeof window === 'undefined' ? 'https://app.invalid' : window.location.origin;
    const resolved = new URL(raw, origin);
    if (resolved.origin !== origin) return fallback;

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}