import { describe, it, expect } from 'vitest';
import { buildBookingWhatsappLink } from '../utils/whatsapp';
import { site } from '../data/site';

// Booking-First Enrollment: the WhatsApp CTA shown after a booking request
// must always read the phone number from data/site.js (never a hardcoded
// literal duplicated in a component — see that file's own comment on why)
// and must correctly URL-encode the pre-filled message.

describe('buildBookingWhatsappLink', () => {
  it('builds a wa.me link using the number from data/site.js', () => {
    const href = buildBookingWhatsappLink({ name: 'Amina', plan: 'Huffaz', bookingRef: 'AR-20260913-ABCD' });
    expect(href.startsWith(`https://wa.me/${site.whatsapp}?text=`)).toBe(true);
  });

  it('URL-encodes the default message, including name/plan/bookingRef', () => {
    const href = buildBookingWhatsappLink({ name: 'Amina Student', plan: 'Huffaz', bookingRef: 'AR-20260913-ABCD' });
    const [, encoded] = href.split('?text=');
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toContain('Amina Student');
    expect(decoded).toContain('Huffaz');
    expect(decoded).toContain('AR-20260913-ABCD');
    // Confirms real percent-encoding happened (spaces are not literal in the URL).
    expect(encoded).not.toContain(' ');
  });

  it('uses a custom message verbatim when provided, still correctly encoded', () => {
    const href = buildBookingWhatsappLink({ message: 'Custom message with spaces & symbols?' });
    const [, encoded] = href.split('?text=');
    expect(decodeURIComponent(encoded)).toBe('Custom message with spaces & symbols?');
  });

  it('omits missing fields from the default message without leaving empty lines like "Plan: "', () => {
    const href = buildBookingWhatsappLink({ name: 'Amina' });
    const decoded = decodeURIComponent(href.split('?text=')[1]);
    expect(decoded).not.toMatch(/Plan:\s*$/m);
    expect(decoded).not.toMatch(/Booking ref:\s*$/m);
  });
});
