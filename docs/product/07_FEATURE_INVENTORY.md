# 07 — Feature Inventory

> Every product feature, grouped logically, each labelled by maturity. Includes hidden, unfinished, and deprecated features. Sources: backend routes/controllers/models, frontend pages/components (see [08_API_MAPPING.md](08_API_MAPPING.md) and [06_COMPONENT_INVENTORY.md](06_COMPONENT_INVENTORY.md)).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md).

**Maturity labels** (all verified against code):
- ✅ **Complete** — wired frontend ↔ api ↔ route ↔ model.
- 🟠 **Preview/mock** — UI exists, **no backend**, discloses itself via `PreviewBanner`.
- ⚪ **Static editorial** — content-only, no real accounts/data wiring.
- 🟡 **Client-only** — works fully in the browser / via external API, no app backend needed.
- 🕳️ **Hidden/secondary** — real but not surfaced in primary nav.
- ⚠️ **Unfinished / flagged** — partial or with a documented caveat.

---

## A. Authentication & accounts

| Feature | Status | Anchors |
|---|---|---|
| Email/password register (student/parent) | ✅ | `authController`, `models/User` |
| Login + httpOnly JWT + `tokenVersion` invalidation | ✅ | `authController`, `AuthContext` |
| Google sign-in | ✅ | `POST /api/auth/google` |
| Forgot / reset password (hashed token) | ✅ | `authController` |
| Parent-link code issuance | ✅ | `GET /api/auth/link-code` |
| Admin auth: 2-stage TOTP MFA, QR setup | ✅ | `adminAuthController`, `AdminUser` |
| Admin refresh-token family rotation + reuse detection | ✅ | `adminSessionService`, `RefreshToken` |
| Admin account lockout (5→15min), IP whitelist, encrypted MFA secret | ✅ | `AdminUser`, `ipWhitelist`, `encryption` |

## B. Enrollment & trials

| Feature | Status | Anchors |
|---|---|---|
| Public free-trial request + admin email | ✅ | `trialController`, `Trial.jsx`, `QuickTrialModal` |
| Multi-step enrollment wizard | ✅ | `enrollmentController`, `EnrollWizard`, `Enrollment` |
| Admin trial + enrollment views | ✅ | `AdminTrialsTab`, enrollments list |

## C. Payments & billing

| Feature | Status | Anchors |
|---|---|---|
| Stripe recurring checkout + webhook (checkout/renewal/cancel) | ✅ | `stripeController` |
| PayPal order + capture + webhook (idempotent) | ✅ | `paymentController` |
| Manual/offline payment (bank/WU/MoneyGram/Payoneer/PayPal.me) + admin approval | ✅ | `manualPaymentController` |
| Unified post-payment fulfillment (transactional) | ✅ | `checkoutService.fulfillPaidCheckout` |
| Server-authoritative pricing (3 EUR plans, 25% off) | ✅ | `config/plans.js` |
| Coupons: validate + admin CRUD, per-user + maxUses guards | ✅ | `couponController`, `couponService`, `Coupon` |
| Invoices: auto-numbered (`INV-YYYY-####`), student + admin views | ✅ | `invoiceController`, `Invoice`, `Counter` |
| Subscription lifecycle (activate/renew/deactivate/credit) | ✅ | `subscriptionService` |
| **Financial freeze kill-switch** (blocks manual approve/reject) | 🕳️ | `financialGuard`, `SystemConfig` |

## D. Courses & learning

| Feature | Status | Anchors |
|---|---|---|
| Public course catalogue (paid content stripped) | ✅ | `courseController.getCourses` |
| Subscription-gated course content (`locked:true` payload) | ✅ | `courseController.getCourse` |
| Modules → lessons structure with resources | ✅ | `Course` (embedded subschemas) |
| Per-student lesson progress toggle | ✅ | `progressController`, `CourseProgress` |
| Cascade course delete (progress/wishlist/cert/review/records) | ✅ | `deleteCourseCascade` |
| Course reviews (create + public read + moderation) | ✅ | `reviewController`, `CourseReviews` |
| Static marketing course pages (Ijazah/Islamic Studies/Arabic/Quran) | 🟡 | `coursePages`, `islamicStudiesData` |

## E. Quran reader & memorization (flagship)

| Feature | Status | Anchors |
|---|---|---|
| Reader: Surah/Page/Juz/Hizb nav × Continuous/Verse modes | ✅ | `Quran.jsx`, `features/quran/*` |
| Verse-synced audio (separate from Hifz engine) | ✅ | `useQuranAudioEngine` |
| Hifz repeat/test drills | ✅ | `useQuranHifz` |
| Bookmarks / notes / highlights (persist) | ✅ | `QuranBookmark`, `/api/quran-bookmarks` |
| Reading position + streak + goal | ✅ | `QuranReadingProgress`, `/api/quran-progress` |
| Memorization stats + recording studio | ✅ | `QuranMemorizationStats`, `/api/quran-memo`, `useQuranRecorder` |
| Hifz chapter tracking (verse-range set) | ✅ | `HifzProgress`, `/api/hifz` |
| Tafsir panel/picker, reciters | ✅ (🔵 external data) | `TafsirPanel`, `api/quran.js` |

## F. Certificates

| Feature | Status | Anchors |
|---|---|---|
| Issue (ijazah/completion/hifz/attendance) + email + notification | ✅ | `certificateController` |
| Auto-numbered (`CERT-YYYY-####`) | ✅ | `Counter` |
| Student view/print (XSS-safe template) | ✅ | `CertificateCard` |
| Revoke (soft) | ✅ | `revokeCertificate` |

## G. Communication & social

| Feature | Status | Anchors |
|---|---|---|
| 1:1 messaging (student ↔ assigned teacher, scoped) | ✅ | `messageController`, `Messages.jsx` |
| Notifications (16 types, 30s poll, TTL 90d) | ✅ | `notificationService`, `NotificationPanel` |
| Community feed (posts/comments/likes, moderated) | ✅ | `communityController`, `Community.jsx` |
| Reviews (teacher/course, moderated) | ✅ | `reviewController` |
| AI Tutor (Anthropic `claude-opus-4-8`, SSE stream, daily cap) | ✅ | `aiTutorController`, `AiTutor.jsx` |

## H. Teacher & parent

| Feature | Status | Anchors |
|---|---|---|
| Teacher: assigned students + summary (batched aggregations) | ✅ | `teacherController` |
| Teacher: student records CRUD (grade/attendance/memo/tajweed/homework) | ✅ | `StudentRecord`, `StudentModal` |
| Live classes: role-aware list, staff create/update/delete | ✅ | `liveClassController`, `LiveClass` |
| Parent: link/unlink children, children list + detail | ✅ | `parentController` |
| Weekly parent email report (cron) | ✅ | `cronController.sendWeeklyParentReports` |

## I. Growth & engagement

| Feature | Status | Anchors |
|---|---|---|
| Referrals: code = last 8 of `_id`, track + admin convert → 30-day credit to both | ✅ | `referralController`, `Referral` |
| Gamification: XP/level/streak/badges on lesson completion | ✅ 🕳️ | `progressController` (XP_PER_LESSON=20), `User.gamification` |
| Milestone celebration + share achievement | ✅ | `MilestoneCelebration`, `ShareAchievement` |
| Wishlist | ✅ | `wishlistController`, `Wishlist` |
| Newsletter subscribe | ✅ | `subscriberController`, `Subscriber` |
| Contact form (stores IP) | ✅ | `contactController`, `ContactMessage` |
| Global/course/teacher search + Command Palette (Ctrl+K) | ✅ | `searchController`, `CommandPalette` |
| Exit-intent popup, live chat, WhatsApp FAB, cancel survey | ✅ 🕳️ | `ExitIntentPopup`, `LiveChat`, `WhatsappFab`, `CancelSurvey` |
| Renewal-reminder email (cron, idempotent per period) | ✅ | `cronController.sendRenewalReminders` |

## J. Content & marketing

| Feature | Status | Anchors |
|---|---|---|
| Blog (live API list/detail, view counter) + admin CRUD | ✅ (🟢 verified) | `blogController`, `Blog.jsx` (`CATEGORY_COLORS` static) |
| FAQ | 🟡 | `faqItems.js` |
| Home marketing sections (hero/pricing/testimonials/steps/trust…) | 🟡 | `features/marketing/*` |
| Level quiz, isnad chain, live counter, stats banner | 🟡 🕳️ | `LevelQuiz`, `IsnadChain`, `LiveCounter`, `StatsBanner` |

## K. Islamic tools (free surface)

| Feature | Status | Notes |
|---|---|---|
| Tasbeeh counter | 🟡 | client-only |
| Qibla compass | 🟡 | device orientation |
| Prayer times | 🟡🔵 | geolocation + external |
| Islamic (Hijri) calendar | 🟡 | `calendarHelpers` |
| Verse of the day | 🟡🔵 | |
| Arabic alphabet learner | 🟡 | `useSpeech` |
| Tajweed checker | ⚠️ | **[verify]** depth of implementation |
| Hifz review | 🟡 | |
| Adhkar | 🟡 | static `adhkarData`/`adhkarText` |
| Hadith library | 🟡 | **[verify]** static vs external API |

## L. Admin console & operations

| Feature | Status | Anchors |
|---|---|---|
| 10 admin tabs (users/courses/payments/trials/staff/classes/newsletter/community/reviews/progress) | ✅ | `features/admin/*` |
| Generic admin CRUD factory | ✅ | `crudController.createCRUDController` |
| System status + **maintenance mode** kill-switch | 🕳️ | `systemController`, `SystemConfig` |
| **Financial freeze** kill-switch | 🕳️ | `financialGuard` |
| Immutable audit log (read + GDPR purge ≥90d) | ✅ 🕳️ | `SystemAuditLog`, `auditService` |
| Admin account provisioning (super-admin) | ✅ | `systemController`, `createAdminUser.js` |

---

## M. Preview / mock / static (must-not-fake surfaces)

| Feature | Status | Why it matters |
|---|---|---|
| **Homework page** | 🟠 Preview/mock | No `/api/homework/*`; renders illustrative data behind `PreviewBanner`; source comment ("nothing is actually saved"). Must never report fake success (CLAUDE.md "Honest-data rule"). |
| **Attendance page** | 🟠 Preview/mock | No `/api/attendance/*`; same disclosure pattern. |
| **Public teacher directory** | ⚪ Static editorial | `data/marketing/teachers.js`, `Teachers.jsx`, `TeacherProfile.jsx` — **no real accounts**; must never be wired to the real review/user systems. |

---

## N. Hidden / secondary features (real but not in primary nav)

- **Kill-switches** (maintenance mode, financial freeze) — super-admin only, no prominent UI surface documented.
- **Gamification internals** (badges, streak logic) — surfaced only via dashboard cards, not a dedicated screen.
- **Command Palette** (Ctrl+K) — power-user search, discoverable only via keyboard/search button.
- **Exit-intent popup / cancel survey** — triggered by behavior, not navigation.
- **Referral conversion** — admin-side `PATCH .../convert`; the reward mechanics are largely invisible to users beyond `ReferralCard`.
- **Marketing widgets** (`LiveCounter`, `IsnadChain`, `LevelQuiz`) — engagement props on Home. **[verify]** whether `LiveCounter`/`StatsBanner` numbers are live or illustrative (relevant to the fabricated-social-proof rule in CLAUDE.md).

---

## O. Deprecated / migration-in-progress (documented)

- **Legacy flat routes** (`/quran`, `/blog`, `/about`, `/teachers`, …) → replaced by grouped routes with `<Navigate>` redirects (see [02_INFORMATION_ARCHITECTURE.md](02_INFORMATION_ARCHITECTURE.md)).
- **Admin reads on the legacy stack** → being migrated to `/api/v1/admin/*` (tracked in [../ROUTE_CONSOLIDATION_PLAN.md](../ROUTE_CONSOLIDATION_PLAN.md)).
- **Bespoke modals** → migrating to `Modal.jsx` (2 documented exceptions remain, [ADR 0002](../adr/0002-single-modal-component.md)).
- **Inline `TXT` translation dictionaries** → migration reported complete; a grep for the `const TXT =` pattern in `frontend/src/` **found none** (verified). i18n now flows through the 6 locale files.
- **Backward-compat CSS primitives** (`--green`, `--gold`, `--radius`, gradients) retained in tokens for unmigrated legacy components.

See [12_MISSING_SCREENS.md](12_MISSING_SCREENS.md) for the gap between mock surfaces and the real features they imply.
