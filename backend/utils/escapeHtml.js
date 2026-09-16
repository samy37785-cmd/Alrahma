// Shared HTML-escaping helper for interpolating user-supplied strings into
// HTML email templates (config/emailTemplates.js). Falls back to an em-dash
// for empty/nullish input, matching how this app's email templates already
// render a missing field — this is a template-display convention, not a
// generic escaping contract, so treat it as scoped to email-template use.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;') || '—';
}
