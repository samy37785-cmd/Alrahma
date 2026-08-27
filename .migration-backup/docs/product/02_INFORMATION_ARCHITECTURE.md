# 02 — Information Architecture

> Every screen, the navigation systems that connect them, and their hierarchy/relationships. Route source of truth: [frontend/src/App.jsx](../../frontend/src/App.jsx). Navigation source of truth: [Header.jsx](../../frontend/src/components/layout/Header.jsx) (public) and [dashboardNav.js](../../frontend/src/components/layout/dashboardNav.js) (authenticated).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Per-screen detail lives in [05_SCREEN_INVENTORY.md](05_SCREEN_INVENTORY.md).

---

## 1. Two navigation shells

The app has **two distinct chrome/navigation shells**:

1. **Public / marketing shell** — top `Header` with mega-dropdowns, footer, live chat, WhatsApp FAB. Used by all public pages and by logged-in users while browsing marketing/tool pages.
2. **Authenticated dashboard shell** — `DashboardLayout` (collapsible left sidebar + top header + mobile bottom nav). Used by `/dashboard`, `/admin`, `/teacher`, `/parent` and the account/learning inner pages.

> **[needs verification — runtime]** Which exact pages mount `DashboardLayout` vs the public `Header` is determined per-page (each page imports its own layout). The mapping below reflects the sidebar config in `dashboardNav.js` and the route intent; confirm by opening individual pages if a precise per-page shell map is required.

---

## 2. Top-level IA map

```
Al-Rahma Academy
│
├── PUBLIC (marketing shell)
│   ├── / .......................... Home (marketing landing)
│   ├── Courses (hub /courses)
│   │   ├── /courses/quran ......... Quran & Tajweed (+ #hifz anchor)
│   │   ├── /courses/arabic ........ Arabic
│   │   ├── /courses/ijazah ........ Ijazah
│   │   └── /courses/islamic-studies Islamic Studies
│   ├── Tools (hub /tools)
│   │   ├── /tools/quran-reader .... Quran reader (flagship free tool)
│   │   ├── /tools/adhkar
│   │   ├── /tools/hadith
│   │   ├── /tools/prayer .......... Islamic tools combo
│   │   ├── /tools/prayer-times
│   │   ├── /tools/qibla
│   │   ├── /tools/islamic-calendar
│   │   ├── /tools/verse-of-the-day
│   │   ├── /tools/tasbeeh
│   │   ├── /tools/arabic-alphabet
│   │   ├── /tools/tajweed-checker
│   │   └── /tools/hifz-review
│   ├── Resources (hub /resources)
│   │   ├── /resources/blog ........ Blog list
│   │   ├── /resources/blog/:slug .. Blog post
│   │   └── /resources/faq
│   ├── Academy (hub /academy)
│   │   ├── /academy/about
│   │   ├── /academy/teachers ...... Static teacher directory
│   │   ├── /academy/teachers/:id .. Static teacher profile
│   │   ├── /academy/privacy
│   │   ├── /academy/terms
│   │   └── /academy/refund-policy
│   ├── /enroll ................... Enrollment wizard (CTA target)
│   ├── /login  /register
│   ├── /forgot-password  /reset-password
│   └── /payment/success  /payment/cancel
│
├── STUDENT (dashboard shell, ProtectedRoute)
│   ├── /dashboard ................ Student home
│   ├── /courses/:id .............. Course content (subscription-gated)
│   ├── /billing ................. Invoices
│   ├── /wishlist
│   ├── /ai-tutor
│   ├── /calendar ................ My schedule
│   ├── /homework ................ PREVIEW/MOCK (no backend)
│   ├── /attendance .............. PREVIEW/MOCK (no backend)
│   ├── /community
│   ├── /messages
│   └── /profile
│
├── TEACHER (ProtectedRoute role="teacher")
│   └── /teacher ................. Teacher dashboard (+ shared /calendar /attendance /homework /messages /profile)
│
├── PARENT (ProtectedRoute role="parent")
│   └── /parent .................. Parent dashboard (+ shared /messages /profile)
│
├── ADMIN (ProtectedRoute adminOnly → AdminSessionGate)
│   ├── /admin/login ............. Admin MFA login
│   └── /admin ................... Admin console (tabbed via #hash)
│
└── * ........................... NotFound (404)
```

---

## 3. Full route table

Guards: `ProtectedRoute` (any logged-in user), `ProtectedRoute adminOnly`, `ProtectedRoute role="teacher|parent"`, and `AdminSessionGate` (separate admin MFA session, nested inside `adminOnly`). See [03_USER_ROLES.md](03_USER_ROLES.md) for guard semantics.

### Public
| Route | Component | Notes |
|---|---|---|
| `/` | `pages/Home.jsx` | Assembles `components/features/marketing/*` sections |
| `/courses` | `pages/hubs/CoursesHub.jsx` | Hub |
| `/courses/quran` | `pages/hubs/CoursesQuran.jsx` | `#hifz` anchor |
| `/courses/arabic` | `pages/hubs/CoursesArabic.jsx` | |
| `/courses/ijazah` | `pages/CourseIjazah.jsx` | |
| `/courses/islamic-studies` | `pages/CourseIslamicStudies.jsx` | |
| `/tools` | `pages/hubs/ToolsHub.jsx` | Hub |
| `/tools/quran-reader` | `pages/Quran.jsx` | Flagship reader |
| `/tools/adhkar` | `pages/Adhkar.jsx` | |
| `/tools/hadith` | `pages/HadithLibrary.jsx` | |
| `/tools/prayer` | `pages/IslamicTools.jsx` | Combo |
| `/tools/prayer-times` | `pages/tools/PrayerTimesPage.jsx` | |
| `/tools/qibla` | `pages/tools/QiblaPage.jsx` | |
| `/tools/islamic-calendar` | `pages/tools/IslamicCalendarPage.jsx` | |
| `/tools/verse-of-the-day` | `pages/tools/VerseOfTheDayPage.jsx` | |
| `/tools/tasbeeh` | `pages/tools/TasbeehPage.jsx` | |
| `/tools/arabic-alphabet` | `pages/tools/ArabicAlphabetPage.jsx` | |
| `/tools/tajweed-checker` | `pages/tools/TajweedCheckerPage.jsx` | |
| `/tools/hifz-review` | `pages/tools/HifzReviewPage.jsx` | |
| `/tools/quran` | → redirect `/tools/quran-reader` | |
| `/resources` | `pages/hubs/ResourcesHub.jsx` | Hub |
| `/resources/blog` | `pages/Blog.jsx` | |
| `/resources/blog/:slug` | `pages/BlogPost.jsx` | |
| `/resources/faq` | `pages/FAQ.jsx` | |
| `/academy` | `pages/hubs/AcademyHub.jsx` | Hub |
| `/academy/about` | `pages/About.jsx` | |
| `/academy/teachers` | `pages/Teachers.jsx` | Static directory |
| `/academy/teachers/:id` | `pages/TeacherProfile.jsx` | Static profile |
| `/academy/privacy` | `pages/Privacy.jsx` | |
| `/academy/terms` | `pages/TermsOfService.jsx` | |
| `/academy/refund-policy` | `pages/RefundPolicy.jsx` | |
| `/login` | `pages/Login.jsx` | |
| `/register` | `pages/Register.jsx` | |
| `/forgot-password` | `pages/ForgotPassword.jsx` | |
| `/reset-password` | `pages/ResetPassword.jsx` | |
| `/enroll` | `pages/Enroll.jsx` | Enrollment wizard |
| `/payment/success` | `pages/PaymentResult.jsx` | |
| `/payment/cancel` | `pages/PaymentResult.jsx` | `cancelled` prop |

### Protected (any authenticated user unless noted)
| Route | Component | Guard | Role intent |
|---|---|---|---|
| `/courses/:id` | `pages/CourseContent.jsx` | ProtectedRoute | Enrolled student |
| `/dashboard` | `pages/Dashboard.jsx` | ProtectedRoute | Student |
| `/billing` | `pages/Billing.jsx` | ProtectedRoute | Student |
| `/wishlist` | `pages/Wishlist.jsx` | ProtectedRoute | Student |
| `/ai-tutor` | `pages/AiTutor.jsx` | ProtectedRoute | Student |
| `/community` | `pages/Community.jsx` | ProtectedRoute | All |
| `/profile` | `pages/Profile.jsx` | ProtectedRoute | All |
| `/messages` | `pages/Messages.jsx` | ProtectedRoute | All |
| `/calendar` | `pages/CalendarPage.jsx` | ProtectedRoute | Student/Teacher |
| `/attendance` | `pages/AttendancePage.jsx` | ProtectedRoute | **Preview/mock** |
| `/homework` | `pages/HomeworkPage.jsx` | ProtectedRoute | **Preview/mock** |
| `/admin/login` | `pages/AdminLogin.jsx` | ProtectedRoute **adminOnly** | Admin MFA login |
| `/admin` | `pages/AdminDashboard.jsx` | adminOnly → **AdminSessionGate** | Admin |
| `/teacher` | `pages/TeacherDashboard.jsx` | role="teacher" | Teacher |
| `/parent` | `pages/ParentDashboard.jsx` | role="parent" | Parent |
| `*` | `pages/NotFound.jsx` | — | 404 |

### Legacy redirects (`<Navigate replace>`)
`/quran`→`/tools/quran-reader`, `/adhkar`→`/tools/adhkar`, `/hadith-library`→`/tools/hadith`, `/islamic-tools`→`/tools/prayer`, `/blog`→`/resources/blog`, `/blog/:slug`→`/resources/blog/:slug`, `/faq`→`/resources/faq`, `/about`→`/academy/about`, `/teachers`→`/academy/teachers`, `/teachers/:id`→`/academy/teachers/:id`, `/privacy`→`/academy/privacy`, `/terms`→`/academy/terms`, `/refund-policy`→`/academy/refund-policy`, `/course/ijazah`→`/courses/ijazah`, `/course/islamic-studies`→`/courses/islamic-studies`.

These indicate a **completed IA reorganization** (flat routes → `/courses`, `/tools`, `/resources`, `/academy` groups) with redirects preserved for old links.

---

## 4. Public navigation (Header)

[Header.jsx](../../frontend/src/components/layout/Header.jsx) renders four mega-dropdowns (`NavDropdown`), a CTA, and a right-hand utility cluster.

| Dropdown | Hub | Items |
|---|---|---|
| **Courses** | `/courses` | Quran & Tajweed, Hifz (`/courses/quran#hifz`), Ijazah, Islamic Studies, Arabic |
| **Tools** (wide) | `/tools` | quran-reader, adhkar, hadith, prayer-times, qibla, islamic-calendar, verse-of-the-day, tasbeeh, arabic-alphabet |
| **Resources** | `/resources` | blog, faq |
| **Academy** | `/academy` | about, teachers, privacy |

**CTA:** Enroll (`/enroll`).
**Right cluster:** message bell (`/messages`, logged-in only, unread badge polled every 30s), dark toggle, `LangSwitcher`, parent quick-link "My Children" (`/parent`, parents only), user dropdown (Dashboard/Invoices/Profile/Logout — dashboard target is **role-aware**: admin→`/admin`, teacher→`/teacher`, parent→`/parent`, else `/dashboard`), search button (opens `CommandPalette`, Ctrl+K).
**Mobile:** full drawer adds profile strip, account links, search, theme + language buttons, logout/login.

---

## 5. Authenticated navigation (DashboardLayout sidebar)

Source of truth: [dashboardNav.js](../../frontend/src/components/layout/dashboardNav.js) — `navFor(role)`, `bottomNavFor(role)`, `roleLabel(user)`.

### Admin
`MAIN` → Overview `/admin` · `MANAGEMENT` → Users `/admin#users`, Courses `/admin#courses`, Payments `/admin#payments`, Trials `/admin#trials`, Staff `/admin#staff` · `COMMUNITY` → Messages · `HELP` → View Site.

> The admin console is a **single page with tab state driven by URL hash** (`/admin#users` etc.), not separate routes. Tabs render `components/features/admin/Admin*Tab.jsx`.

### Teacher
Dashboard `/teacher` · `TEACHING` → Calendar, Attendance, Homework, Quran Reader · Messages · Profile · `HELP` → WhatsApp Support, View Site.

### Parent
Dashboard `/parent` · Messages · Profile · WhatsApp Support · View Site.

### Student (default)
Dashboard `/dashboard` · `LEARNING` → Quran Reader, AI Tutor `/ai-tutor`, My Schedule `/calendar`, Homework, Wishlist · `COMMUNITY` → Messages, Community · `ACCOUNT` → Profile, Billing · `HELP` → WhatsApp, View Site.

### Mobile bottom nav (`bottomNavFor`)
3–4 item bar per role (Dashboard/Overview, Messages, one role-specific link, Profile). `roleLabel()` renders "Administrator"/"Teacher"/"Parent", or "`<plan>` Plan"/"Student" for regular users.

**Note:** the dashboard shell has its **own** notifications bell (separate `notifications/unread` query) and command palette, in addition to the Header's message bell — see [10_UX_PROBLEMS.md](10_UX_PROBLEMS.md) for the resulting duplication.

---

## 6. Screen relationships & key linkages

- **Marketing → funnel:** Home / course hubs → `/enroll` (wizard) or `QuickTrialModal` → payment (`CheckoutModal`) → `/payment/success`.
- **Course discovery → consumption:** `/courses` hub → course landing → (after subscription) `/courses/:id` content with per-lesson progress.
- **Quran free tool → paid Hifz:** `/tools/quran-reader` (public) shares components with the Hifz course surface; bookmarks/progress persist only for logged-in users.
- **Dashboard hub-and-spoke:** each role's dashboard is the hub; sidebar links are the spokes.
- **Admin console:** hub-and-spoke via hash tabs; drill-downs open modals (`AdminProgressModal`, user/course editors) rather than sub-routes.
- **Notifications & messages:** cross-cutting — reachable from both shells; two independent unread badges (bell vs messages).

See [04_USER_FLOWS.md](04_USER_FLOWS.md) for step-by-step journeys across these linkages.
