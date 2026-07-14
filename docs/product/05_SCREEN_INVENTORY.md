# 05 — Screen Inventory

> Every screen (route-level page): purpose, inputs, outputs, states, dependencies, and **notable missing states**. Grouped by shell/role. Route source: [App.jsx](../../frontend/src/App.jsx). Component detail: [06_COMPONENT_INVENTORY.md](06_COMPONENT_INVENTORY.md).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md).

**Scope note & [needs verification]:** purpose/inputs/outputs/dependencies below are derived from the route table, component names, and the API/hook wiring already mapped. Per-screen **state coverage** (exact loading/empty/error variants present in each page's JSX) was **not exhaustively read line-by-line** for all ~60 pages; state gaps flagged here are the high-confidence ones. A full per-page state audit requires opening each page file. Where a page is confirmed mock/static it is marked explicitly.

Legend for **Data**: 🟢 live backend · 🔵 external API · 🟡 client-only/static · 🟠 preview-mock (no backend) · ⚪ editorial-static (no accounts).

---

## 1. Public — marketing & hubs

| Screen | Purpose | Inputs | Outputs | Data | Key deps | Notable missing/weak states |
|---|---|---|---|---|---|---|
| Home `/` | Marketing landing / conversion | — | Section CTAs → `/enroll`, trial modal | 🟡 | `features/marketing/*`, `LiveCounter`, `Testimonials` | Static social-proof widgets (see UX problems) |
| CoursesHub `/courses` | Course category landing | — | Links to course pages | 🟡 | hub layout | — |
| CoursesQuran `/courses/quran` | Quran/Tajweed/Hifz sell page (`#hifz`) | anchor | CTA → enroll/trial | 🟡 | `coursePages` content | — |
| CoursesArabic `/courses/arabic` | Arabic sell page | — | CTA | 🟡 | | — |
| CourseIjazah `/courses/ijazah` | Ijazah sell page | — | CTA | 🟡 | | — |
| CourseIslamicStudies `/courses/islamic-studies` | Islamic Studies sell page | — | CTA | 🟡 | `IslamicStudiesBookCard`, `islamicStudiesData` | — |
| ToolsHub `/tools` | Tools directory | — | Links to tools | 🟡 | | — |
| ResourcesHub `/resources` | Resources directory | — | Links to blog/faq | 🟡 | | — |
| AcademyHub `/academy` | About/academy directory | — | Links | 🟡 | | — |
| About `/academy/about` | Brand story | — | — | 🟡 | `data/about.js` | — |
| Privacy / Terms / RefundPolicy | Legal | — | — | 🟡 | | — |
| FAQ `/resources/faq` | Q&A | search/expand | — | 🟡 | `faqItems.js`, `features/marketing/FAQ` | — |

## 2. Public — tools

| Screen | Purpose | Data | Key deps | Notable states |
|---|---|---|---|---|
| Quran `/tools/quran-reader` | **Flagship** reader/mushaf/Hifz studio | 🔵+🟢 | `features/quran/*`, `useQuranAudioEngine`, `useQuranHifz`, `api/quran.js` | Loading verses, reciter switch, guest-no-persist, recording; a11y tested (`QuranMushafPage.a11y`) |
| Adhkar `/tools/adhkar` | Morning/evening remembrances | 🟡 | `adhkarData.js`, `adhkarText.js` | — |
| HadithLibrary `/tools/hadith` | Hadith browse | 🟡/🔵 | | **[verify]** data source (static vs API) |
| IslamicTools `/tools/prayer` | Prayer/tools combo | 🔵 | `islamicToolsUtils.js` | Geolocation permission/error |
| PrayerTimesPage `/tools/prayer-times` | Prayer times | 🔵 | | Location denied/error |
| QiblaPage `/tools/qibla` | Qibla compass | 🟡 | `QiblaCompass` | Device-orientation permission/error |
| IslamicCalendarPage `/tools/islamic-calendar` | Hijri calendar | 🟡 | `calendarHelpers.js` | — |
| VerseOfTheDayPage `/tools/verse-of-the-day` | Daily verse | 🔵 | `VerseCardModal` | Loading/error |
| TasbeehPage `/tools/tasbeeh` | Digital counter | 🟡 | `Tasbeeh` | — |
| ArabicAlphabetPage `/tools/arabic-alphabet` | Alphabet learner | 🟡 | `AlphabetLearner`, `useSpeech` | Speech-unsupported |
| TajweedCheckerPage `/tools/tajweed-checker` | Tajweed check | 🟡 | `useSpeech` | **[verify]** depth of logic |
| HifzReviewPage `/tools/hifz-review` | Hifz review drills | 🟡 | | — |

## 3. Public — content, auth, enrollment

| Screen | Purpose | Inputs | Data | Key deps | Notable states |
|---|---|---|---|---|---|
| Blog `/resources/blog` | Blog list | filter/category | 🟢 (`/api/blog`) | `useBlogPosts`; `CATEGORY_COLORS` from static file | Loading, **empty**, error |
| BlogPost `/resources/blog/:slug` | Single post (increments views) | slug | 🟢 | `useBlogPost` | Loading, **not-found**, error |
| Login `/login` | Password/Google login | email, password | 🟢 | `AuthContext`, RHF | Invalid creds, rate-limited, loading |
| Register `/register` | Sign up (student/parent) | name, email, password, role | 🟢 | `AuthContext`, RHF | Field validation, dup email, loading |
| ForgotPassword `/forgot-password` | Request reset | email | 🟢 | | Always-200 success message |
| ResetPassword `/reset-password` | Set new password | token, password | 🟢 | | Invalid/expired token |
| Enroll `/enroll` | Multi-step enrollment wizard | many (name, times, subjects…) | 🟢 | `EnrollWizard`, `TrialContext` | Step validation, submit success, error |
| PaymentResult `/payment/success`·`/cancel` | Post-payment confirmation | query params | 🟢 | | Success vs cancelled prop; **[verify]** pending-manual state |

## 4. Student (dashboard shell)

| Screen | Purpose | Inputs | Data | Key deps | Notable missing/weak states |
|---|---|---|---|---|---|
| Dashboard `/dashboard` | Student home / hub | — | 🟢 | `useDashboard`, `features/dashboard/*` cards | Loading (skeletons), empty (no courses/classes) |
| CourseContent `/courses/:id` | Lesson player + progress | course id | 🟢 | `useCourses`, `progress` API, `courseLessonHelpers` | **Locked (no subscription)**, empty modules, lesson toggle |
| Billing `/billing` | Invoices list | — | 🟢 | `useBilling`/`useInvoices`, `InvoiceModal` | Loading, **empty (no invoices)**, error |
| Wishlist `/wishlist` | Saved courses | — | 🟢 | `useWishlist`, `WishlistButton` | **Empty wishlist**, loading |
| AiTutor `/ai-tutor` | AI chat tutor | prompt | 🟢+🔵 | `useAiTutor`, SSE stream | Streaming, daily-cap-reached, error, empty conversations |
| Community `/community` | Social feed | post/comment/like | 🟢 | `useCommunity` | Pending-moderation, empty feed, loading |
| Messages `/messages` | 1:1 messaging | message body | 🟢 | `messageApi` | Empty contacts, no conversation selected, send error |
| Profile `/profile` | Account + certificates | profile fields | 🟢 | `authApi`, `CertificateCard` | Save success/error, empty certificates |
| CalendarPage `/calendar` | Class schedule | — | 🟢 | `classApi`, `calendarHelpers`, `UpcomingClassCard` | Empty (no classes), loading |
| Homework `/homework` | Homework tracker | — | 🟠 **MOCK** | `PreviewBanner` | **No backend** — renders illustrative data, must not report fake success |
| Attendance `/attendance` | Attendance tracker | — | 🟠 **MOCK** | `PreviewBanner` | **No backend** — illustrative only |

## 5. Teacher / Parent

| Screen | Purpose | Data | Key deps | Notable states |
|---|---|---|---|---|
| TeacherDashboard `/teacher` | My students, records, classes | 🟢 | `teacherApi`, `StudentModal` | Empty (no assigned students), record CRUD, loading |
| ParentDashboard `/parent` | Linked children progress | 🟢 | `parentApi`, `ChildModal` | **No children linked**, invalid link code, loading |

Teachers also use shared `/calendar`, `/attendance` (mock), `/homework` (mock), `/messages`, `/profile`. Parents use `/messages`, `/profile`.

## 6. Admin

| Screen / Tab | Purpose | Data | Key deps | Notable states |
|---|---|---|---|---|
| AdminLogin `/admin/login` | MFA login (2-stage) | password, TOTP | 🟢 | `AdminAuthContext` | Stage transitions, QR setup, locked, IP-denied, rate-limited |
| AdminDashboard `/admin` (hash tabs) | Console shell | — | 🟢 | `AdminSessionGate`, `features/admin/*` | Loading, per-tab errors |
| `#users` `AdminUsersTab` | User mgmt (roles, subs, teacher assign) | 🟢 | pagination, search | Empty, loading, mutation errors |
| `#courses` `AdminCoursesTab` | Course CRUD | 🟢 | `AdminProgressModal` | Cascade-delete confirm |
| `#payments` `AdminPaymentsTab` | Manual payment review | 🟢 | `financialGuard` | Frozen (423), double-claim (409) |
| `#trials` `AdminTrialsTab` | Trial requests | 🟢 | | Empty |
| `#staff` `AdminStaffTab` | Admin/staff mgmt | 🟢 | | super-admin-gated actions |
| `AdminClassesTab` | Live classes | 🟢 | | — |
| `AdminNewsletterTab` | Subscribers | 🟢 | | Empty |
| `AdminCommunityTab` | Post/comment moderation | 🟢 | | Empty queue |
| `AdminReviewsTab` | Review moderation | 🟢 | | Empty queue |

## 7. System

| Screen | Purpose | States |
|---|---|---|
| NotFound `*` | 404 | Static |

---

## 8. State-coverage summary (cross-screen)

Verified state affordances that DO exist (from component inventory + tests):
- **Loading:** `Skeleton.jsx`, `ProgressRing.jsx`, React Query `isLoading` on data hooks.
- **Error boundary:** global `ErrorBoundary` (tested).
- **Preview/mock disclosure:** `PreviewBanner.jsx` on Homework/Attendance (tested).
- **Empty/loading/error** on data pages come from React Query states, but **whether each page renders a designed empty state vs a bare fallback is inconsistent** — see [10_UX_PROBLEMS.md](10_UX_PROBLEMS.md) §"Missing empty states."

**[needs verification]** A definitive "which pages lack a designed empty/error state" list requires reading each page's render branches. This inventory flags the high-likelihood gaps (Wishlist, Billing, Messages, Community, ParentDashboard when unlinked, admin tabs) rather than asserting completeness.

See [12_MISSING_SCREENS.md](12_MISSING_SCREENS.md) for screens that should exist but don't, and [10_UX_PROBLEMS.md](10_UX_PROBLEMS.md) for state/feedback gaps.
