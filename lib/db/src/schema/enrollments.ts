import { check, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Public enrollment/lead-capture form (docs/product-scope-audit.md §9).
 * Field list is locked to match the real `Enroll.jsx`/`EnrollWizard`
 * form — not a generic guess. Deliberately has no `user_id`: trial and
 * enrollment submissions stay guest-submittable (§3 account policy).
 *
 * `preferred_teacher_key`/`preferred_teacher_name` reference a STATIC,
 * non-account-backed teacher-directory entry (Teachers.jsx's directory is
 * real editorial marketing content, not tied to any real account) — never
 * a foreign key to `profiles`. `requested_plan_slug` is a lead-capture
 * snapshot only, never a live FK and never trusted as a financial
 * reference (see plans.ts / payments.ts for the real, server-verified
 * pricing path).
 */
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    whatsapp: text("whatsapp"),
    country: text("country"),
    city: text("city"),
    timezone: text("timezone"),
    // Availability slots and subjects of interest — arrays of small
    // strings/objects, not queried into relationally, so jsonb.
    times: jsonb("times").$type<unknown[]>().notNull().default([]),
    subjects: jsonb("subjects").$type<unknown[]>().notNull().default([]),
    lang: text("lang"),
    level: text("level"),
    ageGroup: text("age_group"),
    genderPref: text("gender_pref"),
    preferredTeacherKey: text("preferred_teacher_key"),
    preferredTeacherName: text("preferred_teacher_name"),
    requestedPlanSlug: text("requested_plan_slug"),
    // Canonical default is 'pending' (0031_enrollment_new_status_to_pending
    // .sql) — was 'new' before that corrective migration; matches Mongo's
    // models/Enrollment.js, which has always defaulted to 'pending'.
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    // Booking-First Enrollment (backend/models/Enrollment.js's Mongo
    // counterpart — see that model's own comment for the full rationale).
    // `bookingRef` is generated server-side only, by the
    // submit_enrollment_booking() SECURITY DEFINER RPC (0025 migration) for
    // guest submissions, or directly by an AAL2 admin insert — never
    // client-suppliable via the public INSERT policy's column-restricted
    // grant. The financial fields below are admin-only bookkeeping for the
    // off-site/WhatsApp payment this product uses — never a payment
    // gateway, never card/account data.
    bookingRef: text("booking_ref"),
    agreedAmount: numeric("agreed_amount", { precision: 10, scale: 2 }),
    currency: text("currency"),
    paymentMethodExternal: text("payment_method_external"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    renewalAt: timestamp("renewal_at", { withTimezone: true }),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Baseline remediation: was missing — `status` mutates on admin
    // review.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Structural guards, not full JSON-schema validation: both columns
    // must actually be JSON arrays (not an object/scalar someone forgot
    // to wrap), and every free-text field is capped so the public form
    // can't be abused into an unbounded-size payload.
    check("enrollments_times_is_array", sql`jsonb_typeof(${t.times}) = 'array'`),
    check("enrollments_subjects_is_array", sql`jsonb_typeof(${t.subjects}) = 'array'`),
    check("enrollments_name_len", sql`char_length(${t.name}) <= 255`),
    check("enrollments_email_len", sql`char_length(${t.email}) <= 255`),
    check("enrollments_notes_len", sql`char_length(${t.notes}) <= 4000`),
    check("enrollments_times_size", sql`pg_column_size(${t.times}) <= 8192`),
    check("enrollments_subjects_size", sql`pg_column_size(${t.subjects}) <= 8192`),
    // Baseline remediation: allowlist added. This table conflates the
    // old system's two related-but-separate models (`Enrollment.js`:
    // enum ['pending','contacted','enrolled','cancelled'] and
    // `TrialRequest.js`: enum ['new','contacted','scheduled']) into one
    // unified lead-capture table per the locked v3 field list — this
    // allowlist is a deliberate synthesis of both vocabularies (keeping
    // this table's already-established 'new' default), not a clean 1:1
    // port of either.
    // Widened for Booking-First Enrollment: 'awaiting_payment'/'paid' are
    // the two new intermediate states between an admin having contacted the
    // student and the booking being activated ('enrolled') — same additive,
    // zero-data-migration reasoning as models/Enrollment.js's own enum
    // widening (existing rows already use one of the original 5 values).
    // Further widened by 0030_enrollment_status_reconciliation.sql to also
    // accept 'pending'/'approved' (reconciling with the JS-side
    // ENROLLMENT_STATUSES allowlist), and 'new' stays listed here as a
    // legacy-readable value even though 0031_enrollment_new_status_to_
    // pending.sql migrated every existing 'new' row to 'pending' and no
    // write path can produce 'new' any more.
    check(
      "enrollments_status_allowlist",
      sql`${t.status} IN ('new','contacted','scheduled','awaiting_payment','paid','pending','approved','enrolled','cancelled')`,
    ),
    check("enrollments_agreed_amount_non_negative", sql`${t.agreedAmount} IS NULL OR ${t.agreedAmount} >= 0`),
    check("enrollments_currency_format", sql`${t.currency} IS NULL OR ${t.currency} ~ '^[A-Z]{3}$'`),
    // Postgres unique indexes already treat every NULL as distinct from
    // every other NULL, so this behaves like Mongo's `unique: true, sparse:
    // true` on bookingRef (models/Enrollment.js) with no extra partial-index
    // predicate needed — any number of NULL booking_ref rows co-exist, but
    // two rows can never share the same non-null reference.
    uniqueIndex("enrollments_booking_ref_unique").on(t.bookingRef),
  ],
);
