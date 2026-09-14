// Shared allowlists/validation for Enrollment ("booking request" under
// Booking-First Enrollment). Kept in one place so "what a customer may set"
// and "what an admin may set" are each defined exactly once, and reused by
// both the Mongo admin route (routes/v1/admin/enrollmentsRoutes.js) and the
// Supabase admin route (data/supabase/admin/enrollmentsAdminController.js)
// so the two backends enforce identical rules.

// Fields a guest submitting a booking request may set. Deliberately
// excludes bookingRef/status/agreedAmount/currency/paymentMethodExternal/
// paidAt/renewalAt/adminNote — those are either server-generated or
// admin-only, and must never be assignable from an unauthenticated request
// body (previously `Enrollment.create({ ...data, bookingRef: ... })` passed
// the whole request body straight into Mongoose — a mass-assignment gap).
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

export const ENROLLMENT_STATUSES = ['pending', 'contacted', 'awaiting_payment', 'paid', 'enrolled', 'cancelled'];

// Admin-only bookkeeping fields — never a payment gateway, never card/
// account data (see models/Enrollment.js). Edits touching any of these
// require the extra `payments:write` permission on top of the base
// `enrollments:write` (enforced at the route layer), mirroring the same
// extra-permission boundary already used for ManualPayment review.
export const FINANCIAL_FIELDS = ['agreedAmount', 'currency', 'paymentMethodExternal', 'paidAt', 'renewalAt'];

const ADMIN_UPDATABLE_FIELDS = [
  'name', 'email', 'whatsapp', 'country', 'city', 'timezone', 'notes',
  'status', 'adminNote', ...FINANCIAL_FIELDS,
];

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Validates + allowlists an admin PUT payload for Enrollment.
 * Returns { patch } on success or { error } (a user-facing message; caller
 * should respond 422) on failure. Never returns both.
 *
 * A field explicitly sent as `null` clears it; a field simply omitted from
 * the body is left untouched — `undefined` is not overloaded to mean both,
 * so an admin can deliberately blank out e.g. adminNote or
 * paymentMethodExternal instead of that being unreachable.
 *
 * `currentDoc` (plain object with at least `agreedAmount`) is used for one
 * cross-field rule: a booking cannot be marked 'enrolled' (i.e. the
 * student's account actually activated) with no agreedAmount on record —
 * either already stored or being set in this same request — since that
 * would leave an activated subscription with no bookkeeping trail of what
 * was agreed.
 */
export function buildAdminUpdatePatch(body = {}, currentDoc = {}) {
  const patch = {};
  for (const key of ADMIN_UPDATABLE_FIELDS) {
    if (body[key] === undefined) continue;
    patch[key] = body[key];
  }

  if (patch.status !== undefined) {
    if (patch.status === null || !ENROLLMENT_STATUSES.includes(patch.status)) {
      return { error: `status must be one of: ${ENROLLMENT_STATUSES.join(', ')}` };
    }
    if (patch.status === 'enrolled') {
      const finalAmount = patch.agreedAmount !== undefined ? patch.agreedAmount : currentDoc.agreedAmount;
      if (finalAmount === undefined || finalAmount === null) {
        return { error: 'Cannot mark a booking enrolled without recording an agreedAmount first' };
      }
    }
  }

  if (patch.agreedAmount !== undefined && patch.agreedAmount !== null) {
    const n = Number(patch.agreedAmount);
    if (!Number.isFinite(n) || n < 0) return { error: 'agreedAmount must be a number >= 0' };
    patch.agreedAmount = n;
  }

  if (patch.currency !== undefined && patch.currency !== null) {
    const c = String(patch.currency).trim().toUpperCase();
    if (!CURRENCY_RE.test(c)) return { error: 'currency must be a 3-letter ISO code (e.g. EUR)' };
    patch.currency = c;
  }

  for (const dateField of ['paidAt', 'renewalAt']) {
    if (patch[dateField] !== undefined && patch[dateField] !== null) {
      const d = new Date(patch[dateField]);
      if (Number.isNaN(d.getTime())) return { error: `${dateField} must be a valid date` };
      patch[dateField] = d;
    }
  }

  if (patch.whatsapp !== undefined && patch.whatsapp !== null) {
    const normalized = normalizeWhatsapp(patch.whatsapp);
    if (!normalized) return { error: 'whatsapp must be a valid phone number' };
    patch.whatsapp = normalized;
  }

  return { patch };
}
