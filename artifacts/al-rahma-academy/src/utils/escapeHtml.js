// Escapes a value for safe interpolation into a raw HTML string (e.g. a
// document.write() call in a print/popup window, which bypasses React's
// automatic escaping entirely). Extracted from Profile.jsx's printCertificate
// helper — the one other place in this codebase that builds raw HTML this
// way — so both share the same, single, reviewed escaping implementation
// instead of each hand-rolling (or, in one case, omitting) it.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
