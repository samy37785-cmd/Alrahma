# 10 — UX Problems

> Concrete, code-grounded UX issues. Each is tied to a file or verified pattern. Severity: 🔴 high (affects trust/core flow), 🟠 medium, 🟡 low/polish. Items that are inferences rather than confirmed defects are marked **[needs verification]**.

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Improvement direction: [11_DESIGN_OPPORTUNITIES.md](11_DESIGN_OPPORTUNITIES.md).

---

## 1. Honesty / trust risks

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 1.1 | 🔴 | **Homework & Attendance render illustrative data with no backend.** If a user mistakes them for real, they lose work / trust. Mitigated today by `PreviewBanner`, but they still occupy primary sidebar slots for teacher/student. | [HomeworkPage.jsx](../../frontend/src/pages/HomeworkPage.jsx), [AttendancePage.jsx](../../frontend/src/pages/AttendancePage.jsx), `PreviewBanner` |
| 1.2 | 🟠 | **Public teacher directory is static editorial with no real accounts**, yet lives under `/academy/teachers/:id` with review-looking UI. A visitor cannot tell these tutors aren't bookable/real. | [Teachers.jsx](../../frontend/src/pages/Teachers.jsx), [data/marketing/teachers.js](../../frontend/src/data/marketing/teachers.js) |
| 1.3 | 🟠 | **[needs verification]** Marketing widgets (`LiveCounter`, `StatsBanner`, `Testimonials`) may present illustrative numbers as live social proof — the class of fabricated-social-proof bug CLAUDE.md says has been removed repeatedly. Confirm each renders real or clearly-illustrative data. | `features/marketing/{LiveCounter,StatsBanner,Testimonials}` |

## 2. Missing / inconsistent empty states

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 2.1 | 🟠 | **No shared empty-state component**; each data page handles "no results" ad hoc, so coverage is uneven. High-risk pages: Wishlist (no saved courses), Billing (no invoices), Messages (no contacts / no conversation selected), Community (empty feed), ParentDashboard (no children linked), admin moderation queues (empty). | [06](06_COMPONENT_INVENTORY.md) §reuse; [05](05_SCREEN_INVENTORY.md) §8 |
| 2.2 | 🟡 | **[needs verification]** Whether each of the above renders a designed empty state vs a blank region needs a per-page read. | — |

## 3. Loading & feedback

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 3.1 | 🟠 | Loading affordances exist (`Skeleton`, `ProgressRing`, React Query `isLoading`) but their **application is not uniform** across pages — some data pages likely show layout shift or bare spinners. **[needs verification]** per page. | `Skeleton.jsx` |
| 3.2 | 🟠 | **AI Tutor daily-cap and streaming errors** need clear inline feedback; SSE failures mid-stream are easy to leave ambiguous. **[needs verification]** current handling. | `AiTutor.jsx`, `useAiTutor` |
| 3.3 | 🟡 | Manual-payment "pending admin approval" is an async, human-in-the-loop state — the student needs a clear ongoing status, not just a one-time success screen. | `PaymentResult.jsx`, `manualPaymentController` |

## 4. Navigation & IA friction

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 4.1 | 🟠 | **Two separate notification systems** with independent unread badges and polling: Header **message bell** (`messages/unread`) and DashboardLayout **notification bell** (`notifications/unread`). Users see two bells meaning different things. | [Header.jsx](../../frontend/src/components/layout/Header.jsx), [DashboardLayout.jsx](../../frontend/src/components/layout/DashboardLayout.jsx), [02](02_INFORMATION_ARCHITECTURE.md) §5 |
| 4.2 | 🟠 | **Two navigation shells** (public Header vs DashboardLayout) mean a logged-in user browsing tools sees different chrome than in their dashboard — context switches and possible duplicate controls (theme/lang/search appear in both). | [02](02_INFORMATION_ARCHITECTURE.md) §1 |
| 4.3 | 🟠 | **Admin console is one page with hash-tab state** (`/admin#users`), so tabs aren't deep-linkable as real routes, browser back within the console is weaker, and per-tab loading is coupled. | [AdminDashboard.jsx](../../frontend/src/pages/AdminDashboard.jsx) |
| 4.4 | 🟡 | **Command Palette (Ctrl+K)** is powerful but discoverable only via a small search button — many users won't find it. | `CommandPalette.jsx` |
| 4.5 | 🟡 | Shared routes (`/calendar`, `/messages`, `/profile`, plus the mock `/homework`, `/attendance`) serve multiple roles with role-branching inside — role-specific expectations may not all be met on one screen. | route table |

## 5. Consistency

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 5.1 | 🟠 | **Four component-CSS generations** with overlapping concepts (two card systems `.card`/`.ds-card`, two badge systems) → visual inconsistency between older and newer surfaces. | [09](09_DESIGN_SYSTEM_REQUIREMENTS.md) §7 |
| 5.2 | 🟠 | **Two accent colors** in tokens (legacy gold `#d4af37` vs manuscript amber `#c8842a`) risk inconsistent accents across pages. | [tokens.css](../../frontend/src/styles/tokens.css) |
| 5.3 | 🟡 | **Modal migration incomplete** — 2 documented bespoke modals remain, so dialog chrome isn't uniform yet. | [ADR 0002](../adr/0002-single-modal-component.md) |

## 6. Accessibility

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 6.1 | 🟢 (good) | Positive baseline: skip-link, `useModalA11y`/focus-trap/escape hooks, `prefers-reduced-motion` handled, a11y tests exist (`QuranMushafPage.a11y`, `ResourceModal.a11y`). | test suite |
| 6.2 | 🟠 | **[needs verification]** a11y coverage is spotty — only two components have dedicated a11y tests. Forms, admin tables, the mega-menu, and the Quran controls need keyboard/screen-reader verification. | test dir |
| 6.3 | 🟠 | **RTL correctness** across every component (Arabic) is a broad surface; only enforced by i18n parity + visual baselines, not per-component RTL tests. **[needs verification]**. | i18n |
| 6.4 | 🟡 | Color-contrast of gold/amber accent text on light surfaces should be audited against WCAG AA. **[needs verification]**. | tokens |

## 7. Responsiveness

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 7.1 | 🟢 (good) | Mobile is a first-class concern: mobile bottom nav, mobile drawer, mobile carousel, desktop+mobile visual baselines. | `MobileBottomNav`, `MobileCarousel`, e2e |
| 7.2 | 🟠 | **Dense admin tables** on mobile rely on horizontal scroll (`.ds-table-wrap`) — usable but not a great mobile admin experience. **[needs verification]**. | `dashboard-shell.css` |
| 7.3 | 🟡 | Quran reader (most complex surface) has many controls; small-screen ergonomics of nav×reading-mode matrix should be validated. **[needs verification]**. | `features/quran/*` |

## 8. Error handling

| # | Sev | Problem | Evidence |
|---|---|---|---|
| 8.1 | 🟢 (good) | Global `ErrorBoundary` (Sentry), consistent `{message}` error contract, `adminHttp` hard-redirect on 401. | `ErrorBoundary`, `errorHandler` |
| 8.2 | 🟠 | **Per-screen error states** (network failure on a data page) are likely inconsistent — React Query `isError` handling varies. **[needs verification]** per page. | data hooks |
| 8.3 | 🟠 | **Guest checkout** (`softProtect`) means a payment can complete without an account — the post-payment UX for linking that payment to a later-created account needs to be clear. **[needs verification]**. | `PaymentResult`, `softProtect` |

---

## Summary of highest-priority UX problems

1. **Mock Homework/Attendance in primary nav** (1.1) — decide: build the backend or demote/remove from nav.
2. **Dual notification bells** (4.1) — unify into one notification center.
3. **Empty-state inconsistency** (2.1) — introduce a shared empty-state primitive.
4. **Design-system fragmentation** (5.1, 5.2) — consolidate card/badge/accent duplication.
5. **Static teacher directory reads as real** (1.2) — clarify or connect.

These feed directly into [11_DESIGN_OPPORTUNITIES.md](11_DESIGN_OPPORTUNITIES.md), [12_MISSING_SCREENS.md](12_MISSING_SCREENS.md), and [13_MISSING_COMPONENTS.md](13_MISSING_COMPONENTS.md).
