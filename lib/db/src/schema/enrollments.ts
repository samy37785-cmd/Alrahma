import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    status: text("status").notNull().default("new"),
    notes: text("notes"),
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
    check(
      "enrollments_status_allowlist",
      sql`${t.status} IN ('new','contacted','scheduled','enrolled','cancelled')`,
    ),
  ],
);
