// Shared allowlists/validation for Enrollment ("booking request" — No
// Payments Product, final decision, see docs/current-project-status.md).
// Kept in one place so "what a customer may set" and "what an admin may
// set" are each defined exactly once, and reused by both the Mongo admin
// route (routes/v1/admin/enrollmentsRoutes.js) and the Supabase admin route
// (data/supabase/admin/enrollmentsAdminController.js) so the two backends
// enforce identical rules.

// Fields a guest submitting a booking request may set. Deliberately
// excludes bookingRef/status/adminNote — those are either server-generated
// or admin-only, and must never be assignable from an unauthenticated
// request body (previously `Enrollment.create({ ...data, bookingRef: ... })`
// passed the whole request body straight into Mongoose — a mass-assignment
// gap). No financial field (amount/currency/paidAt/paymentMethod/etc.) has
// ever been, or will ever be, in this list — there is no payment system.
export const PUBLIC_BOOKING_FIELDS = [
  'name', 'email', 'whatsapp', 'country', 'city', 'timezone',
  'times', 'subjects', 'lang', 'level', 'ageGroup', 'genderPref',
  'teacherId', 'teacherName', 'plan', 'notes',
];

export function pickPublicBookingFields(body = {}) {
  const out = {};
  for (const key of PUBLIC_BOOKING_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// E.164-ish: optional leading +, 7-15 digits once separators are stripped —
// matches the ITU E.164 maximum length and is permissive enough for every
// country the enrollment form's own country list covers, while still
// rejecting empty/garbage input. WhatsApp contact is how this whole
// product's booking flow is fulfilled (no other contact channel is used to
// arrange payment/schedule), so it is required, not optional.
const WHATSAPP_DIGITS_RE = /^\+?[0-9]{7,15}$/;

export function normalizeWhatsapp(raw) {
  if (typeof raw !== 'string') return null;
  const stripped = raw.trim().replace(/[\s\-().]/g, '');
  return WHATSAPP_DIGITS_RE.test(stripped) ? stripped : null;
}

// The only statuses a NEW write (public submission or admin update) may
// ever set — non-financial and unambiguous: pending (just booked) →
// approved (admin has reviewed it) → enrolled (admin activated the
// student, non-financially) → cancelled. Deliberately does NOT include the
// pre-existing-prod values 'contacted'/'awaiting_payment'/'paid' — those
// were part of the earlier offline-payment-bookkeeping design and are
// retired along with the rest of the payments product (see
// docs/current-project-status.md). Historical documents already carrying
// one of those values are left untouched in Mongo (never deleted/migrated)
// and remain readable — see models/Enrollment.js's schema-level enum,
// which stays a superset of this list for exactly that reason — they are
// just no longer a value any API can newly set.
export const ENROLLMENT_STATUSES = ['pending', 'approved', 'enrolled', 'cancelled'];

const ADMIN_UPDATABLE_FIELDS = [
  'name', 'email', 'whatsapp', 'country', 'city', 'timezone', 'notes',
  'status', 'adminNote',
];

/**
 * Validates + allowlists an admin PUT payload for Enrollment.
 * Returns { patch } on success or { error } (a user-facing message; caller
 * should respond 422) on failure. Never returns both.
 *
 * A field explicitly sent as `null` clears it; a field simply omitted from
 * the body is left untouched — `undefined` is not overloaded to mean both,
 * so an admin can deliberately blank out e.g. adminNote instead of that
 * being unreachable. No financial field is in ADMIN_UPDATABLE_FIELDS above,
 * so no request body can ever write one through this endpoint, regardless
 * of what it sends — this function is the single allowlist both backends'
 * admin update routes go through.
 */
export function buildAdminUpdatePatch(body = {}) {
  const patch = {};
  for (const key of ADMIN_UPDATABLE_FIELDS) {
    if (body[key] === undefined) continue;
    patch[key] = body[key];
  }

  if (patch.status !== undefined) {
    if (patch.status === null || !ENROLLMENT_STATUSES.includes(patch.status)) {
      return { error: `status must be one of: ${ENROLLMENT_STATUSES.join(', ')}` };
    }
  }

  if (patch.whatsapp !== undefined && patch.whatsapp !== null) {
    const normalized = normalizeWhatsapp(patch.whatsapp);
    if (!normalized) return { error: 'whatsapp must be a valid phone number' };
    patch.whatsapp = normalized;
  }

  return { patch };
}
