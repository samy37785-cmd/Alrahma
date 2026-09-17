import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../components/features/quran/TafsirPanel';

// Production-readiness audit follow-up (2026-09-17): sanitizeHtml() renders
// third-party tafsir HTML (an external API's response, not first-party
// content) via dangerouslySetInnerHTML — this proves the allowlist actually
// holds, and specifically that the DOMParser-based rewrite (replacing a
// live-detached-element .innerHTML= approach) still strips every disallowed
// tag/attribute while keeping the allowed, text-bearing structure intact.
describe('TafsirPanel.sanitizeHtml — security allowlist', () => {
  it('keeps allowed tags and their text content', () => {
    const out = sanitizeHtml('<p>Hello <strong>world</strong></p>');
    expect(out).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('strips the <script> element itself — its raw text content may survive as inert, non-executing text (it is inserted as a text node, never re-parsed/eval\'d), but no <script> tag, and therefore no execution, survives', () => {
    const out = sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toBe('<p>before</p>alert(1)<p>after</p>');
  });

  it('unwraps a disallowed tag but keeps its safe text content', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click me</a>');
    expect(out).not.toMatch(/<a\b/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('click me');
  });

  it('strips every attribute from an allowed tag, including event handlers and style', () => {
    const out = sanitizeHtml('<p onclick="alert(1)" style="color:red" class="x">text</p>');
    expect(out).toBe('<p>text</p>');
  });

  it('neutralizes an <img onerror=...> tag — no attribute, no element, survives', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  it('neutralizes an <svg><image onerror=...>> payload nested inside allowed tags', () => {
    const out = sanitizeHtml('<p><svg><image href="x" onerror="alert(1)" /></svg></p>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toMatch(/alert\(1\)/);
  });

  it('returns an empty string for empty/whitespace-only input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
