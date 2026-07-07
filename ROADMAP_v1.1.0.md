# Al-Rahma Academy — v1.1.0 Development Roadmap

Status: **planning only** — no application code, commits, PRs, or releases were created while producing this document. Prepared on branch `feature/v1.1.0-roadmap`, cut from `main` at the `v1.0.0` release commit (`b63e9c5`).

Every finding below is sourced directly from the current repository (models, controllers, routes, components, and test files as they exist on `main` today) — not from assumptions about what a platform "should" have. Where a claim depends on something outside the repo (e.g. product priorities), it's called out explicitly.

---

## 1. Repository Audit

### 1.1 Current Architecture

- **Monorepo**: `frontend/` (React 18 + Vite + React Router 7 + React Query v5, deployed to Vercel) and `backend/` (Express 4 + Mongoose 8 + Winston, deployed as a standalone Render process). See `CLAUDE.md` for the full breakdown — unchanged since v1.0.0.
- **Auth**: two separate systems — regular users via httpOnly JWT cookie + refresh-token rotation (`models/RefreshToken.js`), and a separate zero-trust `AdminUser` system with mandatory TOTP MFA, IP whitelist, and its own rate limiter, mounted at `/api/v1/admin/*`.
- **28 Mongoose models** (`backend/models/`): `AdminUser`, `Blog`, `Certificate`, `ContactMessage`, `Counter`, `Coupon`, `Course`, `CourseProgress`, `Enrollment`, `HifzProgress`, `Invoice`, `LiveClass`, `ManualPayment`, `Message`, `Notification`, `Payment`, `QuranBookmark`, `QuranMemorizationStats`, `QuranReadingProgress`, `Referral`, `RefreshToken`, `Review`, `StudentRecord`, `Subscriber`, `SystemAuditLog`, `SystemConfig`, `TrialRequest`, `User`, `Wishlist`.
- **46 lazy-loaded frontend pages** (`App.jsx`), organized around hub pages (`/courses`, `/tools`, `/resources`, `/academy`) with nested detail routes, plus 4 role-specific dashboards (`Dashboard`, `TeacherDashboard`, `ParentDashboard`, `AdminDashboard`).
- **CI**: `.github/workflows/ci.yml` — parallel backend/frontend lint + test (+ build) jobs, green on `main` as of the v1.0.0 tag. Current test counts: **205 backend tests**, **42 frontend tests** (34 + 11 files respectively by count on disk).

### 1.2 Existing Features (verified working, end to end)

- Course catalog, enrollment, and content delivery (video/text lessons, modules).
- Payments: Stripe (subscriptions) and PayPal (one-time/subscription), plus a manual-payment flow (bank transfer / Western Union / MoneyGram) with admin review.
- Quran reading module: Surah/Page/Juz/Hizb navigation, continuous vs. verse-by-verse rendering, bookmarks + notes + highlights, reading-progress/streak tracking, a separate Hifz (memorization) practice + recording studio, audio sync playback.
- Islamic tools: Adhkar, Tasbeeh counter, Prayer Times, Qibla compass, Islamic Calendar, Verse of the Day, Tajweed checker, Arabic Alphabet learner, Hadith Library.
- Teacher dashboard: student list with computed progress/hifz summaries, per-student record CRUD, class scheduling (`LiveClass`), attendance, homework.
- Parent dashboard: linked-children view, per-child progress, a WhatsApp-shareable text report generator, class calendar.
- Admin dashboard: revenue/user-growth charts, activity feed, course/user/enrollment/staff/coupon/trial/newsletter/manual-payment management, system status (maintenance mode, financials-frozen toggle), immutable audit log.
- Referral program with self-healing legacy-user code backfill (from earlier work this project).
- Certificates (completion/hifz/ijazah/attendance) with a printable view.
- i18n: 6 languages (en/ar/it/es/de/fr) including full RTL support for Arabic.
- Monitoring: Sentry (frontend), Winston (backend, Console + rotating files in production), `/health` + `/ready` probes, cron-completion logging — all shipped in v1.0.0.

### 1.3 Missing / Incomplete Functionality (verified by direct code inspection)

These are not guesses — each was confirmed by reading the actual model, controller, and frontend code:

1. **Notifications are write-side hollow.** `models/Notification.js` defines 14 real event types (`class_scheduled`, `payment_received`, `message_received`, `certificate_issued`, etc.) with a proper compound index and a 90-day TTL index. `controllers/notificationController.js` exports a ready-to-use `createNotification()` helper. **Grepping the entire backend confirms `createNotification` has zero callers outside its own file.** No controller anywhere — not payments, not enrollment, not messaging, not certificates — actually creates a notification when its event happens. The only thing that works today is the generic list/read/delete CRUD, which the frontend `NotificationPanel` (fixed in v1.0.0) can display, but there is currently nothing real for it to show.
2. **Notification read-state doesn't persist.** `NotificationPanel.jsx`'s "mark as read" / "mark all read" actions only update local component state (`useState(new Set())`). The backend already has working `PATCH /api/notifications/:id/read` and `PATCH /api/notifications/read-all` endpoints — the frontend simply never calls them. A reload re-shows everything as unread.
3. **Reviews are disconnected from the UI they should power.** `models/Review.js` and `controllers/reviewController.js` (`createReview`, admin `moderateReview`) are real, tested, and reachable via `POST /api/reviews`. But `TeacherProfile.jsx` displays `teacher.rating`/`teacher.reviews` as **static fields read directly off the `User` document**, and its "add your rating" control computes an average **client-side using `localStorage`** (`tc-rating-${teacher.id}` key) — it never calls the review API at all. The frontend's own `api/reviewApi.js` module was removed as dead code during the v1.0.0 architecture cleanup (T22) because grepping found zero callers — confirming this disconnect predates that cleanup; the cleanup just made the gap visible by removing the unused file.
4. **Wishlist has zero UI.** `models/Wishlist.js`, `hooks/useWishlist.js`, and `api/wishlistApi.js` are fully implemented and have dedicated test coverage (`useWishlist.test.jsx`) — but grepping every `.jsx` file in the frontend for "wishlist" (case-insensitive) outside of tests returns **nothing**. There is no "Add to wishlist" button anywhere and no "My Wishlist" page.
5. **Partial admin API migration.** `backend/routes/authRoutes.js:31` has a self-documented `// TODO: migrate to /api/v1/admin router once the admin frontend is updated.` above `GET/POST /api/auth/users`. Only `users`, `courses`, `enrollments`, and `system` have actually been migrated to the zero-trust `/api/v1/admin/*` pipeline (MFA-gated, IP-whitelisted, strict CSP). Payments review, trials, staff creation, newsletter, and coupon management still run through the older `protect + adminOnly` pattern on regular (non-admin-JWT) routes.
6. **Search is minimal and siloed.** `routes/searchRoutes.js` exposes three independent endpoints (`/`, `/courses`, `/teachers`) built on unanchored regex matching (a deliberate, documented tradeoff from earlier work — see `docs/adr/0001-defer-plain-indexes-for-regex-search.md`). There is no unified search-with-filters UI, no autocomplete/typeahead, and no combined results view.
7. **No reporting export.** Neither `package.json` lists any CSV/PDF export library, nor does any controller build one. The only "report" a parent can produce is the WhatsApp-shareable plain-text summary in `ParentDashboard.jsx`. Admin-side hifz/course progress views (`AdminProgressModal.jsx`) are on-screen only.
8. **No parent–teacher messaging.** `models/Message.js` is a direct `from`/`to` pair with a comment stating it's specifically "a direct message between a student and their assigned teacher" — parents have no message channel to teachers at all.
9. **`eslint-plugin-jsx-a11y` is not integrated**, despite a manual accessibility pass having been done in earlier work — there's no automated CI guard against a11y regressions in new code.
10. **No real-time transport.** Neither `package.json` lists `socket.io`/`ws`. Notifications and messages are polled via React Query (`staleTime`), not pushed.

### 1.4 Technical Debt

- The admin API split (§1.3.5) is the most consequential debt item — it's security-relevant (older admin routes bypass the MFA-gated pipeline) and is already self-flagged in the code.
- `DsChart.jsx` (recharts-based admin charts) compiles to a **~400KB** JS chunk (`dist/assets/DsChart-*.js`) — confirmed via the current production build output. It's already route-split to the admin dashboard (not loaded on public pages), so the impact is scoped to admin users only, but it's worth splitting further if more chart types are added.
- Several dashboard pages (`AdminDashboard.jsx`, `ParentDashboard.jsx`, `TeacherDashboard.jsx`) carry heavy inline `style={{...}}` blocks rather than the shared CSS/token system used elsewhere in the app — a maintainability, not correctness, concern.
- No automated Lighthouse/CLS budget check in CI — performance regressions (like the ones fixed in the mobile-performance pass referenced in `CLAUDE.md`) are currently only caught by manual field testing.

### 1.5 Potential Risks (carried over, still open as of v1.0.0)

- `ADMIN_IP_WHITELIST` must be confirmed set on the live Render environment (fails closed since v1.0.0 — flagged in every relevant release doc).
- No cookie-consent banner despite GA4 being wired up.
- Rate limiting defaults to in-memory unless `REDIS_URL` is set.
- MongoDB Atlas backup/retention configuration is unverifiable from source (dashboard-level setting).

---

## 2. Feature Backlog

Each item lists **Business value**, **User impact**, **Technical complexity**, **Estimated effort**, and **Dependencies**. Effort is in engineer-days for a single senior engineer familiar with the codebase, assuming the "one task, full regression, minimal diff" discipline already established in this project.

### P0 — Critical

#### P0-1. Wire real events into the notification system
- **Business value**: Notifications are a shipped, tested, indexed feature that currently notifies no one of anything real — this is the single highest-leverage gap in the whole backlog, since ~90% of the infrastructure already exists.
- **User impact**: Students/teachers/parents get in-app visibility into class scheduling changes, payment outcomes, new messages, enrollment decisions, and certificate issuance — closing the loop on features that already silently succeed/fail today with no notification.
- **Technical complexity**: Low-medium per call site (call the existing `createNotification()` helper at the right point in each controller); medium in aggregate because it touches ~6 different controllers.
- **Estimated effort**: 3–4 days (spread across small, controller-by-controller PRs — see §5).
- **Dependencies**: None. Purely additive backend work using existing model/helper.

#### P0-2. Persist notification read-state to the backend
- **Business value**: Makes the notification bell trustworthy — right now "mark all read" is cosmetic and resets on reload.
- **User impact**: Direct, immediate correctness fix for every logged-in user.
- **Technical complexity**: Low — two already-existing, already-tested endpoints (`markNotifRead`, `markAllNotifsRead`) just need to be called from `NotificationPanel.jsx`'s existing click handlers, plus a React Query cache invalidation.
- **Estimated effort**: 0.5–1 day.
- **Dependencies**: None (independent of P0-1; can ship first).

#### P0-3. Connect the Review system to Teacher Profiles
- **Business value**: Removes a real integrity gap — the displayed "rating" is not the product of the review system the backend already enforces (moderation, 1–5 scale, per-course).
- **User impact**: Students get real, persisted reviews instead of a localStorage illusion; teachers get actual feedback; prospective students see genuine social proof.
- **Technical complexity**: Medium — needs a new `frontend/src/api/reviewApi.js` (the old one was removed as dead code, so this isn't a revert, it's a fresh, small module), a fetch-and-display component for approved reviews on `TeacherProfile.jsx`, and a review-submission form gated to students who completed a course with that teacher.
- **Estimated effort**: 3–5 days.
- **Dependencies**: None on the backend (already built and tested). Should land after P0-1/P0-2 if `review_approved`/notification wiring is desired at the same time, but is independently shippable.

### P1 — High

#### P1-1. Finish the admin API migration to `/api/v1/admin`
- **Business value**: Closes a self-documented security gap — brings payments, trials, staff, newsletter, and coupon management under the MFA-gated, IP-whitelisted pipeline that `users`/`courses`/`enrollments`/`system` already use.
- **User impact**: Indirect (admin-only), but materially reduces the admin attack surface.
- **Technical complexity**: Medium — mechanical route migration, but requires careful coordination with the frontend's `adminApi.js` call sites and a deprecation strategy for old URLs (see §6).
- **Estimated effort**: 4–6 days.
- **Dependencies**: Best sequenced after P0-1 (see §5 — both touch payment/enrollment controllers).

#### P1-2. Build the missing Wishlist UI
- **Business value**: Recovers value from an already-built, already-tested backend feature (`Wishlist` model, `useWishlist`/`useIsWishlisted` hooks, full API) that currently returns zero value because there's no UI.
- **User impact**: Lets students save courses for later — a standard e-commerce/course-platform expectation currently entirely absent.
- **Technical complexity**: Low — zero backend changes needed; purely a "Save" button on course cards + a "My Wishlist" page consuming the existing, tested hooks.
- **Estimated effort**: 2–3 days.
- **Dependencies**: None. Fully isolated from every other item in this backlog.

#### P1-3. Exportable student/child progress report
- **Business value**: Turns the current "copy a WhatsApp message" parent workflow and the admin's on-screen-only hifz/course report into an actual downloadable artifact.
- **User impact**: Parents and admins get a report they can save, print, or send as a real document rather than a text blob or a screenshot.
- **Technical complexity**: Medium-high — requires choosing and adding an export dependency (e.g. a lightweight CSV writer for tabular data, or a print-optimized HTML view reusing the existing `CertificateCard`-style `window.print()` pattern already proven in this codebase for certificates — the print-window approach avoids adding a new PDF-generation dependency at all).
- **Estimated effort**: 4–6 days.
- **Dependencies**: None functionally, but benefits from being scoped carefully to avoid dependency creep (see §6).

#### P1-4. Unified, filterable search UI
- **Business value**: Makes the existing `/api/search/courses` and `/api/search/teachers` filter parameters (level, subject, gender, language — already implemented server-side) actually discoverable and usable together.
- **User impact**: Students can find the right course/teacher faster instead of browsing hub pages.
- **Technical complexity**: Medium — mostly frontend (a combined search UI with debounced input + filter chips); backend already supports the needed query parameters.
- **Estimated effort**: 4–5 days.
- **Dependencies**: None.

### P2 — Medium

#### P2-1. Integrate `eslint-plugin-jsx-a11y` into CI
- **Business value**: Converts the manual accessibility audit already performed in this project into a permanent, automatic regression guard.
- **User impact**: Indirect — prevents future a11y regressions rather than fixing existing ones (which were already addressed).
- **Technical complexity**: Low — add the plugin, add its recommended rule set to `frontend/eslint.config.js`, fix whatever it flags (expected to be minor given the prior manual pass).
- **Estimated effort**: 1–2 days.
- **Dependencies**: None.

#### P2-2. Parent–teacher messaging
- **Business value**: Closes a real communication gap — parents currently cannot message a teacher directly through the platform.
- **User impact**: Parents get a direct channel instead of relying on the WhatsApp report or out-of-band contact.
- **Technical complexity**: Medium — the `Message` model's `from`/`to` shape technically supports any two users already; the work is mostly UI (a parent-facing message thread) plus deciding/enforcing who a parent is allowed to message (their linked children's teachers only).
- **Estimated effort**: 4–5 days.
- **Dependencies**: Should be scoped as a product decision first (which teacher(s) can a parent reach — the child's assigned teacher, or any teacher?) — this is the one item in the backlog where the answer isn't fully determined by the existing code and needs a explicit product call before implementation.

#### P2-3. Further code-split the admin chart bundle
- **Business value**: Reduces admin dashboard load time; low urgency since it's already isolated from public pages.
- **User impact**: Faster admin dashboard loads, admin-only.
- **Technical complexity**: Low-medium — split `DsChart.jsx`'s individual chart components into separate dynamic imports per chart type.
- **Estimated effort**: 1–2 days.
- **Dependencies**: None.

#### P2-4. Inline-style cleanup in dashboard pages
- **Business value**: Maintainability only — no user-facing change.
- **User impact**: None directly; reduces risk of future visual inconsistency.
- **Technical complexity**: Low per-file, but broad (3 large dashboard files).
- **Estimated effort**: 3–4 days.
- **Dependencies**: None. Best done as its own isolated cleanup, not mixed into feature PRs.

### P3 — Nice to Have

#### P3-1. Real-time notifications/messages (WebSocket)
- **Business value**: Removes polling latency for notifications/messages.
- **User impact**: Instant delivery instead of up to `staleTime` delay.
- **Technical complexity**: High — new infrastructure (`socket.io` or equivalent), connection lifecycle, auth-over-websocket, Render/Vercel deployment implications.
- **Estimated effort**: 8–12 days.
- **Dependencies**: Should follow P0-1 (real events must exist before real-time delivery of them is worth building).

#### P3-2. Service worker / offline support
- **Business value**: Installability polish on top of the already-solid `manifest.json`.
- **User impact**: Offline asset caching, faster repeat loads.
- **Technical complexity**: Medium — needs careful cache invalidation strategy given the app's frequent deploys.
- **Estimated effort**: 3–5 days.
- **Dependencies**: None, but lower priority than functional gaps above.

#### P3-3. Favicon `.ico` fallback
- **Business value**: Cosmetic fix for legacy browsers only.
- **Technical complexity**: Trivial.
- **Estimated effort**: <0.5 day.
- **Dependencies**: None. Already tracked in `POST_LAUNCH_CHECKLIST.md`.

---

## 3. Release Plan

### v1.1.0 (this cycle) — kept intentionally tight
1. **P0-2** — Notification read-state persistence
2. **P0-1** — Real event wiring for notifications
3. **P0-3** — Review ↔ Teacher Profile connection
4. **P1-2** — Wishlist UI
5. **P1-1** — Finish admin API migration

Rationale: every v1.1.0 item either finishes an already-half-built feature (P0-1, P0-2, P0-3, P1-2 all have existing, tested backend infrastructure with zero schema changes) or closes a self-documented security TODO (P1-1). None require a new dependency, a database migration, or a product-scope decision that isn't already implied by the existing code. This is deliberately a "finish what v1.0.0 started" release, not a new-feature release.

### v1.2.0
- **P1-3** — Exportable progress reports
- **P1-4** — Unified search UI
- **P2-1** — `jsx-a11y` CI integration
- **P2-3** — Admin chart bundle splitting

Rationale: these are net-new UI surfaces or new tooling integrations — larger, more design-dependent, and benefit from a full cycle on their own rather than competing for review bandwidth with the P0 fixes above.

### Future releases (v1.3.0+)
- **P2-2** — Parent–teacher messaging (pending the product decision noted above)
- **P2-4** — Inline-style cleanup (pure refactor — batch separately from feature work)
- **P3-1** — Real-time transport (natural follow-up once P0-1's event model has been live for a cycle)
- **P3-2** — Service worker / offline support
- **P3-3** — Favicon `.ico`

---

## 4. GitHub Issues (titles + descriptions, ready to file)

> These are drafted for the human maintainer to create via `gh issue create` or the GitHub UI — none were created as part of this planning pass, per the "analysis and planning only" constraint.

**#1 — Persist notification read-state to the backend**
> `NotificationPanel.jsx`'s mark-as-read / mark-all-read actions only update local component state; a page reload shows every notification as unread again, even though `PATCH /api/notifications/:id/read` and `PATCH /api/notifications/read-all` already exist and are already tested. Wire the existing click handlers to call these endpoints and invalidate the `['notifications']` React Query cache key. No backend changes required.
> Labels: `bug`, `frontend`, `P0`

**#2 — Wire real events into the notification system**
> `createNotification()` in `controllers/notificationController.js` has zero callers anywhere in the codebase, despite the `Notification` model supporting 14 real event types. Add calls to it from the relevant controllers: class scheduled/cancelled/reminder (`liveClassController`), payment received/failed (`paymentController`/`manualPaymentController`), subscription renewed/expiring (cron/webhook handlers), message received (`messageController`), enrollment approved/rejected (`enrollmentController`), certificate issued (`certificateController`), admin announcement (new admin action), coupon received (`couponController`), review approved (`reviewController`). Land as separate, small PRs per controller to keep diffs reviewable. Add a test per call site asserting the correct `Notification` document is created.
> Labels: `feature`, `backend`, `P0`

**#3 — Connect the Review system to Teacher Profiles**
> `TeacherProfile.jsx` currently reads a static `teacher.rating`/`teacher.reviews` field and computes a fake "your rating" average in `localStorage`, never calling the real, tested `POST /api/reviews` endpoint. Add a `frontend/src/api/reviewApi.js` module (the previous one was removed as dead code — this is a fresh addition, not a revert), a review list/display component sourcing real moderated reviews, and a review-submission form for students who completed a course with that teacher.
> Labels: `feature`, `frontend`, `backend`, `P0`

**#4 — Build the missing Wishlist UI**
> The `Wishlist` model, `useWishlist`/`useIsWishlisted` hooks, and full wishlist API are implemented and covered by tests, but no `.jsx` file in the app references "wishlist" outside of test files — there is no UI at all. Add a save/unsave control to course cards and a "My Wishlist" page. Zero backend changes needed.
> Labels: `feature`, `frontend`, `P1`

**#5 — Finish migrating admin routes to `/api/v1/admin`**
> `backend/routes/authRoutes.js:31` documents a pending migration: payments review, trials, staff creation, newsletter, and coupon management still run on the legacy `protect + adminOnly` pattern instead of the zero-trust `/api/v1/admin/*` pipeline (MFA + IP whitelist + strict CSP) that `users`/`courses`/`enrollments`/`system` already use. Migrate the remaining admin controllers, update the frontend's `adminApi.js` call sites in lockstep, and keep the old routes as thin aliases for one release cycle before removing them.
> Labels: `security`, `backend`, `P1`

**#6 — Exportable student/parent progress report**
> The only "report" available today is a WhatsApp-shareable plain-text summary (`ParentDashboard.jsx`) or an on-screen-only admin view (`AdminProgressModal.jsx`). Add a downloadable/printable report, reusing the existing `window.print()`-based pattern already proven for certificates rather than introducing a new PDF-generation dependency.
> Labels: `feature`, `frontend`, `P1`

**#7 — Unified, filterable course/teacher search**
> `/api/search/courses` and `/api/search/teachers` already support level/subject/gender/language filters server-side, but there's no combined, discoverable frontend UI for them. Build a unified search experience with debounced input and filter chips.
> Labels: `feature`, `frontend`, `P1`

**#8 — Integrate `eslint-plugin-jsx-a11y` into CI**
> No automated accessibility linting exists despite a manual a11y pass having been completed. Add the plugin with its recommended rule set to `frontend/eslint.config.js` and fix any newly-surfaced issues.
> Labels: `accessibility`, `tooling`, `P2`

**#9 — Parent–teacher messaging**
> `models/Message.js` only supports student↔teacher conversations; parents have no in-app channel to message a teacher. Needs a product decision on scope (which teacher(s) a parent may message) before implementation.
> Labels: `feature`, `needs-product-decision`, `P2`

**#10 — Further code-split the admin chart bundle**
> `DsChart.jsx` compiles to a ~400KB chunk. It's already isolated to the admin dashboard, but splitting individual chart types into separate dynamic imports would reduce admin dashboard load time further.
> Labels: `performance`, `frontend`, `P2`

**#11 — Inline-style cleanup in dashboard pages**
> `AdminDashboard.jsx`, `ParentDashboard.jsx`, and `TeacherDashboard.jsx` carry large inline `style={{...}}` blocks instead of using the shared CSS/token system. Pure maintainability refactor — no user-facing change. Should be its own PR, not mixed into feature work.
> Labels: `refactor`, `frontend`, `P2`

**#12 — Real-time notifications and messages**
> Notifications and messages are currently polled via React Query rather than pushed. Once real events are flowing (#2), consider WebSocket-based delivery for instant updates.
> Labels: `feature`, `infrastructure`, `P3`

**#13 — Service worker / offline support**
> `manifest.json` is a complete, working PWA manifest, but no service worker exists for offline asset caching.
> Labels: `feature`, `frontend`, `P3`

**#14 — Favicon `.ico` fallback**
> Only `favicon.svg` exists; some legacy browsers show a broken tab icon. Already tracked in `POST_LAUNCH_CHECKLIST.md`.
> Labels: `polish`, `P3`

---

## 5. Implementation Order (v1.1.0)

Sequenced to minimize merge conflicts and regression risk, based on which files each item actually touches:

1. **#1 Notification read-state persistence** — smallest, most isolated change (one file, `NotificationPanel.jsx`, plus a cache-invalidation call). Ships first to build a clean baseline before other notification work lands.
2. **#2 Real event wiring** — land as **separate PRs per controller** (e.g. one PR for `liveClassController`, one for `paymentController`, one for `messageController`, etc.) rather than one large PR. This is both lower regression risk (each controller's existing tests stay isolated) and easier to review. Do this before #5 (admin route migration) because both touch `paymentController.js`/`enrollmentController.js` — landing the notification hooks first means the route migration only has to move already-stable code, not code that's still changing.
3. **#4 Wishlist UI** — fully independent of everything else (new files only, zero shared files with #1/#2/#5). Can actually be developed in parallel by a second engineer at any point, but is sequenced here so review bandwidth isn't split across too many concurrent backend-touching PRs early on.
4. **#3 Review ↔ Teacher Profile** — independent of #1/#2/#4; touches `TeacherProfile.jsx` and adds a new `reviewApi.js`. No file overlap with the other four items.
5. **#5 Finish admin route migration** — landed last precisely because it's the one item with real API-compatibility risk (§6); doing it after the notification-event wiring (#2) means the payment/enrollment controllers it touches are no longer also being modified by another in-flight PR.

---

## 6. Risks

### Breaking changes
- **#5 (admin route migration) is the only item with a real breaking-change risk.** Moving payments/trials/staff/newsletter/coupon admin endpoints to new URLs breaks any caller still hitting the old paths. Mitigation: land the new `/api/v1/admin/*` routes and update the frontend's `adminApi.js` call sites in the *same* PR, and keep the old routes mounted as thin aliases (delegating to the same controllers) for one full release cycle before deleting them — the same pattern already used successfully for the deprecated `api/client.js` barrel in earlier frontend cleanup work.
- No other v1.1.0 item changes an existing API response shape, removes a field, or alters existing business logic.

### Database migration needs
- **None.** Every v1.1.0 item (notifications, reviews, wishlist, admin routes) uses models that already exist in their current shape. No new fields, no backfills, no index changes are required for any v1.1.0 item.

### API compatibility concerns
- Covered above under Breaking changes (#5 is the only concern).
- #2 (notification event wiring) adds new *writes* to existing controllers but does not change any existing response shape — API consumers see no difference except that notifications now populate.

### Testing requirements
- **#1**: extend `NotificationPanel`'s existing test file with assertions that clicking mark-read/mark-all-read calls the API and updates the cache (mirroring the mock-based pattern already used for `NotificationPanel.test.jsx`).
- **#2**: one test per new call site, asserting a `Notification` document is created with the correct `type`/`recipient`/`link` when the underlying action succeeds — using the same `setupTestDb`/`mock.method` patterns already established across this project's backend test suite.
- **#3**: backend needs no new tests (endpoint already tested); frontend needs tests for the new `reviewApi.js` module and the review display/submission components.
- **#4**: frontend tests for the new wishlist UI components, finally exercising the `useWishlist`/`useIsWishlisted` hooks' existing test investment from actual rendered UI (currently they're only unit-tested in isolation).
- **#5**: route-level tests confirming both the new `/api/v1/admin/*` paths and the temporary legacy aliases return identical responses during the deprecation window, plus a scheduled reminder to remove the aliases and their tests after one release cycle.
- No existing test should need to be weakened or removed for any v1.1.0 item — all are additive.

---

## 7. Summary for the Next Engineer

v1.1.0 is a **"finish what v1.0.0 started"** release: four of its five items complete backend infrastructure that already exists, is already tested, and currently returns zero value because the frontend or a controller-side call was never wired up. The fifth (admin route migration) closes a security TODO the codebase already documents about itself. Nothing in this release requires a new dependency, a database migration, or an unresolved product decision — the one item that does need a product call (parent–teacher messaging) was deliberately pushed to a later release rather than guessed at here.
