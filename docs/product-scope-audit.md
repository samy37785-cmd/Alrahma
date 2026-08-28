# Product Data Scope Reset + Supabase Minimal Baseline Audit

**Date:** 2026-08-28
**Scope of evidence:** `artifacts/al-rahma-academy` and `artifacts/api-server` only.
`.migration-backup/` (the old MongoDB/Express backend) is historical
reference only and was deliberately excluded as a source of truth for this
audit.

## Why this document exists

An earlier pass (commit `ae47640`) built a 34-table Postgres schema for a
Render→Supabase migration by porting the old MongoDB backend's 31 models —
a student/teacher/parent/admin LMS. That schema was pushed to the real (but
still unused/disconnected) Supabase project for verification.

The product owner then corrected the premise: the teacher/parent/student
system and its educational dashboards are **not** part of the product going
forward, regardless of how much of it is currently wired in the active
app's code. This document re-derives the real schema from the active app's
own code, reconciled against that explicit decision, and proposes what to
do with `ae47640` and the already-pushed tables.

**This is a report only.** No RLS, no migration, no changes to the live
Supabase project. That work starts only once this document is reviewed and
its open questions (§8) are answered.

## 1. Current Product Feature Inventory

**Real, wired, CUT per the product decision** (teacher/parent/student
system + educational dashboards): the `role` field (student/teacher/
parent/admin) and all role-based routing/nav; the student `Dashboard.jsx`,
`TeacherDashboard.jsx`, `ParentDashboard.jsx`; `CourseContent.jsx` (lesson
viewer) + course progress; `StudentModal.jsx` (teacher notes on students);
live-class scheduling (`AdminClassesTab`, `CalendarPage`); Hifz progress as
a teacher-assessed record; certificate issuance; parent↔child linking;
dashboard messages/notifications; `AttendancePage.jsx`/`HomeworkPage.jsx`
(already explicitly fake/preview via their own in-code `PreviewBanner` —
never real to begin with); Community (posts/comments/likes) and Wishlist
(explicitly out of scope per the product owner); referrals (already
orphaned — link generation with no backing API calls anywhere); AI Tutor
(explicitly deferred).

**Real, wired, STAYS** (not LMS — pure content/marketing, or one of the two
things explicitly kept): public marketing pages/hubs (Home, Courses/Tools/
Resources/Academy hubs — static content, not DB-driven); Blog
(`Blog.jsx`/`BlogPost.jsx`); trial-request lead capture (`Trial.jsx`,
`QuickTrialModal.jsx`, `ExitIntentPopup.jsx`); newsletter signup
(`Newsletter.jsx`); course enrollment + **real payment**
(`Enroll.jsx` → `CheckoutModal.jsx` → Stripe/PayPal/manual payment →
`PaymentResult.jsx`); a plain user account (register/login/logout/
password-reset, cookie-session-backed) kept specifically to persist
Quran-tool progress; the Quran reader tool and its 3 persistence hooks
(bookmarks, reading progress, memorization stats); most standalone client
tools (Adhkar, Hadith library, Prayer times, Qibla, Islamic calendar,
Verse-of-the-day, Tasbeeh, Arabic alphabet, Hifz-review flashcards) — all
client-only or calling fully external, secret-free APIs, needing no
backend at all; the hardened internal admin login (TOTP MFA, separate from
the regular-user system) — this is the "internal admin" the product owner
said should stay, scoped down to the surviving features only.

**Real, wired, REDESIGNED**: course/teacher Reviews → replaced by a plain
admin-curated **Testimonials** table (no reviewer account, no dashboard).

**Confirmed not real / already dead** (unrelated to the scope decision):
`contact_messages` — the submit function exists but has zero call sites,
no Contact page exists. `TajweedCheckerPage.jsx` brands itself
"AI-Powered" but makes no AI/backend call at all — a labeling inaccuracy,
not a schema question.

**Also confirmed dead data-layer code** (noted for later cleanup, not
acted on here): `classApi.updateClass`, `courseApi.getMyHifz`/`markHifz`,
`enrollmentApi.getEnrollments`/`updateEnrollment`,
`notificationApi.deleteNotif`, `quran.searchQuran`, and the entire
`searchApi.js` feature (implemented end-to-end, zero UI entry point).

## 2. Current API/Data Flow

`artifacts/api-server` handles exactly one route locally (`GET /healthz`);
every other `/api/*` call — including every one this document keeps — is a
transparent reverse-proxy to `UPSTREAM_API_ORIGIN` (defaults to the real
Render backend). No `vercel.json` and no dev-proxy config exist yet in
`artifacts/al-rahma-academy` to reproduce that mapping outside the current
Replit-style same-origin setup. The Quran tool's external API calls
(`api/quran.js`) bypass this entirely — no backend involvement, already and
permanently independent of Render/Supabase.

## 3. Required vs Obsolete Tables

Of the 34 tables pushed in `ae47640`:

**KEEP (redesigned where noted) — 13 tables:** `profiles` (drastically
simplified, §4), `quran_bookmarks`, `quran_reading_progress`,
`quran_memorization_stats`, `enrollments`, `payments` (redesigned — no
`course_id` coupling), `manual_payments`, `invoices` (redesigned, same
reason), `coupons`, `coupon_redemptions`, `trial_requests`, `subscribers`,
`blogs`.

**NEW:** `testimonials` — admin-authored, no user account or dashboard
dependency.

**DROP — 20 tables** (LMS/teacher-parent-student system, or already
orphaned regardless of the scope decision): `profile_children`,
`admin_lockouts`, `courses`, `course_progress`, `certificates`,
`student_records`, `live_classes`, `hifz_progress`, `referrals`,
`messages`, `notifications`, `reviews` (superseded by `testimonials`),
`posts`, `post_likes`, `comments`, `wishlist_items`, `tutor_conversations`
(deferred, not deleted-forever), `system_config`, `system_audit_log`,
`rate_limit_counters`.

**Open question (not guessed at):** does `courses` disappear entirely, or
does checkout need a minimal read-only plan/course catalog (name + price)?
`AdminCoursesTab.jsx`'s CRUD was for LMS content authoring (modules/
lessons) — correctly dropped. But `Enroll.jsx`/`CheckoutModal.jsx` need
*some* source of truth for plan names/prices, and no evidence was found of
them reading a `courses` table (their trail points at a `plan` field, not
a `course_id` FK). See §8.

## 4. Required Authentication Model

Not role-based. One plain account type:
`profiles(id → auth.users, email, name, is_admin boolean, created_at)`.
No `role` enum, no teacher/parent fields, no gamification (xp/level/
streak/badges — all Dashboard-only), no `subscription_*` fields (those
modeled recurring LMS-access status, which no longer exists — payments
are treated as one-time course purchases unless told otherwise, see §8).

Internal admin stays a separate, hardened concern (the existing TOTP-MFA
pattern), scoped down to: manual-payment review, trial-request/newsletter
viewing, testimonial CRUD, blog CRUD, and a basic account list.

## 5. Minimal Supabase Schema Proposal

| Table | Purpose | Key columns (illustrative) |
|---|---|---|
| `profiles` | account identity | id (→auth.users), email, name, is_admin, created_at |
| `quran_bookmarks` | reader bookmarks | user_id, verse_key, chapter_id, verse_num, note, color |
| `quran_reading_progress` | reader resume/streak | user_id (PK), resume jsonb, goal, streak, history jsonb |
| `quran_memorization_stats` | hifz-tool stats | user_id (PK), goal, total_recordings, total_practice_time, streak |
| `enrollments` | booking/lead form | name, email, whatsapp, country, city, timezone, lang, level, age_group, gender_pref, plan?, status, notes |
| `payments` | Stripe/PayPal record | user_id (nullable), plan, amount, currency, gateway, status, gateway_order_id (unique), raw jsonb |
| `manual_payments` | WU/bank/Payoneer proof | user_id (nullable), plan, amount, method, reference, status, admin_note |
| `invoices` | receipts | user_id, plan, amount, currency, status, payment_id, gateway_invoice_id (unique) |
| `coupons` | discount codes | code (unique), type, value, max_uses, expires_at, active |
| `coupon_redemptions` | per-user usage | coupon_id, user_id |
| `trial_requests` | free-trial leads | name, email, phone, course/plan, message, status |
| `subscribers` | newsletter | email (unique), status |
| `blogs` | content | title, slug (unique), content, excerpt, tags, published, views |
| `testimonials` (NEW) | admin-curated social proof | author_name, author_role, quote, rating?, context, published, created_by (→profiles), created_at |

## 6. Plan for commit `ae47640`

**Recommendation: replace, don't `git revert`.** A revert would just delete
the 34-table schema with nothing in its place. The right next step is a
fresh commit authoring the 13-table minimal schema above (reusing
`profiles.ts`/`payments.ts`/etc. as starting points, trimmed and
re-shaped, not appended to). `ae47640` stays in git history unmodified —
the new commit's message states explicitly that it supersedes `ae47640`'s
scope after this correction.

## 7. Cleanup Plan for the 34 Live Supabase Tables

The Supabase project is confirmed not wired to any live app and holds no
real user data (the one disposable test signup from Stage 1 was already
deleted and confirmed cleaned up). The simplest safe path, once approved,
is a clean drop of all 34 tables + the `handle_new_user` trigger, followed
by a fresh push of the 13-table minimal schema — not an in-place `ALTER`,
since several tables (`payments`, `profiles`) genuinely change shape. No
urgency; should happen in the same pass as authoring the new schema files
so the pushed DB and committed code never disagree.

## 8. Risks + Open Questions for the Product Owner

1. **Course/plan catalog** — admin-editable price list (a small `plans`
   table) or a code-level constant? Not yet evidenced either way.
2. **Stripe mode** — one-time payment vs. recurring subscription? Affects
   whether `payments`/`profiles` need subscription-status columns.
3. **Admin scope** — confirm the trimmed admin tab list (manual-payment
   review, trials, newsletter, testimonials, blog, basic account list) is
   complete — e.g. does admin need the `enrollments` lead list too?
4. **`ae47640`'s live 34 tables** — confirmed safe to drop-and-replace per
   §7; flagged in case there's a reason not visible from this side.
5. **`api-server` proxy** — still fully Render-dependent for every kept
   feature; moving any of it to call Supabase directly is a later stage,
   not started here.

## Status

- `scripts/post-merge.sh`'s `pnpm --filter db push` line was removed
  (edited, not run) — committed alongside this document.
- No RLS written. No migration applied or reverted on the real Supabase
  project. No push, merge, or deploy. `ae47640` still sits as-is, local
  only, on `main`.

## Next Step

Once this document's open questions (§8) are answered: author the
13-table minimal schema + `testimonials`, drop-and-replace the 34 live
tables with it (verified the same way Stage 1 was — real push, real
read-back, no fabricated data left behind), then move to RLS design scoped
to the new, much smaller table set.
