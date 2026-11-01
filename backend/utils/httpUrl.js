// True only for an absolute http:// or https:// URL. A value that ends up in
// an href (a live class's meeting link, in the student email and on the
// dashboard) must pass this, so it can never be a javascript: or data: URL.
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
