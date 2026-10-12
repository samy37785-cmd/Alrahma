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

// wa.me takes the number in international form, digits only, no "+" (E.164
// is at most 15 digits). Anything else counts as "no WhatsApp number
// configured": callers then show the email success alone, never a broken link.
const WHATSAPP_NUMBER_RE = /^[1-9]\d{7,14}$/;

export function academyWhatsappNumber(number = site.whatsapp) {
  const n = typeof number === 'string' ? number.trim() : '';
  return WHATSAPP_NUMBER_RE.test(n) ? n : null;
}

const TRIAL_FIELDS = ['name', 'course', 'email', 'phone', 'message'];

// The pre-filled message after a successful free-trial request: the intro
// line, then only the fields the visitor actually filled in, each as
// "Label: value". `copy` comes from i18n/trialWhatsapp.js.
export function buildTrialWhatsappMessage(details, copy) {
  const lines = [copy.intro];
  for (const field of TRIAL_FIELDS) {
    const value = typeof details?.[field] === 'string' ? details[field].trim() : '';
    if (value) lines.push(`${copy.labels[field]}: ${value}`);
  }
  return lines.join('\n');
}

// Returns null when no valid academy number is configured. The whole message
// goes through encodeURIComponent once, so Arabic text, "&", "?", "#", "+"
// and line breaks reach WhatsApp exactly as typed.
export function buildTrialWhatsappLink(details, copy, number = site.whatsapp) {
  const to = academyWhatsappNumber(number);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(buildTrialWhatsappMessage(details, copy))}`;
}
