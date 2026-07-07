import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CertificateCard from '../components/ui/CertificateCard';

// Coverage for T21 (security audit): CertificateCard's "Download" button used
// to interpolate admin-supplied certificate fields (title, studentName,
// issuedBy, course.title, certificateNumber) directly into a raw HTML string
// passed to document.write() in a new window — a crafted value (e.g. a
// malicious admin, or a compromised admin session) could execute script in
// that window's same-origin context. Verifies the fix: those fields are now
// HTML-escaped before interpolation, so a value containing markup renders as
// inert text rather than being parsed as an element/script.

const maliciousCert = {
  type: 'completion',
  title: '<img src=x onerror=alert(1)>',
  studentName: '<script>alert(2)</script>',
  issuedBy: '"><svg onload=alert(3)>',
  course: { title: '<b>Bold Course</b>' },
  certificateNumber: 'CERT-<i>1</i>',
  grade: 95,
  issuedAt: '2026-01-01T00:00:00.000Z',
};

function mockWindowOpen() {
  const fakeWin = {
    document: { write: vi.fn(), close: vi.fn() },
    print: vi.fn(),
  };
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin);
  return { fakeWin, openSpy };
}

describe('CertificateCard security: document.write XSS escaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('escapes malicious HTML in certificate fields before writing to the print window', async () => {
    const { fakeWin } = mockWindowOpen();
    render(<CertificateCard cert={maliciousCert} />);

    await userEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(fakeWin.document.write).toHaveBeenCalledTimes(1);
    const html = fakeWin.document.write.mock.calls[0][0];

    // Raw, unescaped payloads must never appear verbatim in the written HTML.
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(2)</script>');
    expect(html).not.toContain('<svg onload=alert(3)>');
    expect(html).not.toContain('<b>Bold Course</b>');
    expect(html).not.toContain('CERT-<i>1</i>');

    // The escaped, inert equivalents must be present instead.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('&lt;svg onload=alert(3)&gt;');
    expect(html).toContain('&lt;b&gt;Bold Course&lt;/b&gt;');
    expect(html).toContain('CERT-&lt;i&gt;1&lt;/i&gt;');
  });

  it('renders normal, non-malicious certificate data unescaped-looking (no double-escaping)', async () => {
    const cert = { ...maliciousCert, title: 'Tajweed Mastery', studentName: 'Amina Khalid', course: { title: 'Tajweed Level 2' }, certificateNumber: 'CERT-0001' };
    const { fakeWin } = mockWindowOpen();
    render(<CertificateCard cert={cert} />);

    await userEvent.click(screen.getByRole('button', { name: /download/i }));

    const html = fakeWin.document.write.mock.calls[0][0];
    expect(html).toContain('Tajweed Mastery');
    expect(html).toContain('Amina Khalid');
    expect(html).toContain('Tajweed Level 2');
    expect(html).toContain('CERT-0001');
  });
});
