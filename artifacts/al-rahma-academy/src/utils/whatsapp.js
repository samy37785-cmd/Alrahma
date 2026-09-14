import { site } from '../data/site';

// Booking-First Enrollment: the single place that builds the pre-filled
// WhatsApp message shown after a booking request is submitted. Always
// reads the phone number from data/site.js (see that file's own comment
// on why it must never be duplicated as a literal elsewhere) — never
// hardcode a WhatsApp number in a component.
export function buildBookingWhatsappLink({ name, plan, bookingRef, message }) {
  const text = message || [
    `Hi, I just submitted a booking request on Al-Rahma Academy.`,
    name ? `Name: ${name}` : null,
    plan ? `Plan: ${plan}` : null,
    bookingRef ? `Booking ref: ${bookingRef}` : null,
  ].filter(Boolean).join('\n');

  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}
