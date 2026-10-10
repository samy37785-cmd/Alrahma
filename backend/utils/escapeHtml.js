// Escapes a value for safe insertion into HTML text or a double/single-quoted
// attribute. Every user-supplied value that reaches an HTML email template
// must pass through this — never interpolate raw request data into markup.
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
