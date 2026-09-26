# Design Brief — Al-Rahma Academy · Prepared for Google Stitch

> A complete product design brief for a from-scratch redesign of Al-Rahma Academy. Written for designers. This document describes **what the product is and what it must become** — not how it is built. It is the single input a design tool (Google Stitch) needs to regenerate the entire experience at premium-SaaS quality.

**Companion references (product truth):** [Master Product Spec](MASTER_PRODUCT_SPEC.md) · [Information Architecture](02_INFORMATION_ARCHITECTURE.md) · [User Roles](03_USER_ROLES.md) · [User Flows](04_USER_FLOWS.md) · [Screen Inventory](05_SCREEN_INVENTORY.md) · [Design System Requirements](09_DESIGN_SYSTEM_REQUIREMENTS.md) · [UX Problems](10_UX_PROBLEMS.md) · [Missing Screens](12_MISSING_SCREENS.md).

**The brief in one line:** Al-Rahma Academy is a warm, trustworthy, multilingual online Islamic academy. The redesign should feel as calm and precise as Linear, as clear and confident as Stripe, as flexible as Notion, and as quietly premium as Vercel — while remaining spiritually serene, deeply Arabic-first, and human.

---

## 1. Product Vision

Al-Rahma Academy is where Muslims around the world learn the Quran, Arabic, and the Islamic sciences — with a real human tutor, at their own pace, in their own language. The product should feel like a **serene modern academy**: a place of focus and reverence, not a noisy marketplace. It blends the calm of a study space with the confidence of a world-class software product.

The redesign must express three feelings simultaneously:
- **Trust** — this is education and money; every screen must feel honest, secure, and considered.
- **Serenity** — Islamic learning is contemplative; the interface should breathe, never shout.
- **Craft** — the polish of a premium SaaS tool signals seriousness and respect for the learner's time.

The Quran reader is the **soul** of the product and the single most important surface. It should be treated as the hero — a beautiful, distraction-free reading and memorization environment worthy of the text it presents.

---

## 2. Product Goals

1. **Turn free learners into students.** A wide free surface (Quran reader, prayer tools, blog) must gracefully guide visitors toward a trial and then a subscription — without ever feeling like a paywall ambush.
2. **Make learning legible.** Progress, memorization, streaks, and certificates should form one visible, motivating journey — not scattered widgets.
3. **Coordinate humans with dignity.** Tutor ↔ student ↔ parent relationships (classes, records, oversight) should feel personal and organized.
4. **Operate with confidence.** Staff need a fast, trustworthy admin experience for people, payments, content, and moderation.
5. **Be truly global.** Six languages including full right-to-left Arabic, with Arabic treated as a first-class citizen, not an afterthought.
6. **Feel premium everywhere.** Every state — loading, empty, error, success — should be designed, never accidental.

---

## 3. Design Principles

1. **Reverence first.** The Quran and Islamic content are handled with visual respect: generous space, refined Arabic typography, no clutter around sacred text.
2. **Calm over dense.** Prefer whitespace, soft depth, and gentle motion. This is a study environment, not a dashboard cockpit.
3. **Warm, not corporate.** The palette is warm cream and deep green, not cold gray. Approachable, human, and rooted in Islamic manuscript tradition.
4. **Honest by default.** Never present demo or illustrative data as if it were real. If something is a preview, it says so, clearly and gracefully.
5. **One system, everywhere.** Every button, card, table, and modal comes from a single, coherent design language. No screen should look like it came from a different app.
6. **Arabic-first, RTL-native.** Mirroring, alignment, and typography for Arabic are designed intentionally, not flipped mechanically.
7. **Earn the premium feeling in the details.** Micro-interactions, empty states, and transitions are where quality is felt.

---

## 4. UX Principles

1. **Always orient the user.** Clear location, clear next step, clear way back. No dead ends.
2. **Progressive disclosure.** Show the essential; reveal complexity on demand (especially in the Quran reader and admin console).
3. **Feedback for every action.** Nothing happens silently — saves, sends, payments, and errors all confirm themselves.
4. **Respect the learner's focus.** Reading and memorization modes minimize chrome and distraction.
5. **Reduce decisions.** Smart defaults, guided flows (enrollment, onboarding), and one obvious primary action per screen.
6. **Consistency is kindness.** The same pattern always behaves the same way. Predictability lowers cognitive load.
7. **Accessible to all.** Keyboard, screen reader, contrast, and reduced-motion are requirements, not options.

---

## 5. Information Architecture

The product has four public content pillars and four authenticated role spaces.

**Public pillars**
- **Courses** — Quran & Tajweed, Hifz, Ijazah, Islamic Studies, Arabic.
- **Tools** — Quran reader (flagship), prayer times, qibla, Islamic calendar, tasbeeh, adhkar, hadith, Arabic alphabet, verse of the day, tajweed practice, hifz review.
- **Resources** — Blog, FAQ.
- **Academy** — About, Tutors, Privacy, Terms, Refund policy.

**Conversion surfaces** — Enroll (guided wizard), Trial request, Login/Register, Payment result.

**Authenticated role spaces**
- **Student** — dashboard, my courses & lessons, Quran reader, AI tutor, schedule, progress & certificates, billing, wishlist, community, messages, profile.
- **Tutor** — dashboard, my students & records, schedule/classes, messages, profile.
- **Parent** — dashboard, my children & their progress, messages, profile.
- **Admin (staff console)** — overview, people, payments & finance, courses & content, enrollments & trials, community & reviews moderation, coupons, blog, system controls & audit.

**IA principle for the redesign:** collapse today's two disconnected shells (a public marketing shell and a separate dashboard shell) into **one adaptive shell** so a logged-in learner never feels like they left the app when they open a free tool.

---

## 6. Navigation Structure

**Public / top navigation (adaptive header)**
- Primary: Courses · Tools · Resources · Academy — each a calm mega-menu, not a wall of links.
- Prominent, single primary CTA: **Start a free trial / Enroll**.
- Utility cluster (persistent across the app): global search, language switcher, theme toggle, notifications, account menu.

**Authenticated / app navigation (unified sidebar + top bar)**
- A single collapsible left sidebar, grouped by intent (Learn / Community / Account / Help), adapting its contents to the user's role.
- A top bar carrying the shared utility cluster (search, notifications, language, theme, account) so it appears exactly once, everywhere.
- Mobile: a bottom tab bar (4 items max) for the most important role destinations, plus a slide-in drawer for the full menu.

**Navigation rules**
- One notification concept, one bell (see §33). Never two competing bells.
- Utility controls (theme, language, search, notifications) live in exactly one place per viewport.
- The account menu always offers: dashboard, account/settings, billing, sign out.

---

## 7. User Roles

| Role | Who they are | What the experience must feel like |
|---|---|---|
| **Visitor** | Prospective learner exploring free tools & content | Inviting, generous, gently guiding toward a trial |
| **Student** | Enrolled learner | Motivating, focused, progress-driven |
| **Tutor** | The teacher (called "tutor" in English UI) | Organized, personal, efficient — like a well-kept gradebook |
| **Parent** | Guardian of one or more children | Reassuring oversight — clarity without micromanagement |
| **Staff / Admin** | Operators running the academy | Fast, trustworthy, powerful — a premium operations console |

Two access realities the design must honor:
- The **admin console is a hardened, separate space** entered through a distinct, secure sign-in. Design it to feel deliberately more locked-down and serious than the learner app.
- Staff have **graduated permissions** (view-only → editor → manager → owner). The UI should gracefully hide or disable what a given staff member cannot do, never show broken or forbidden actions.

Full permission detail: [User Roles](03_USER_ROLES.md).

---

## 8. User Journeys

Design each of these as a complete, confident arc with a beginning, feedback, and a satisfying end.

1. **Discover → Trial.** Visitor explores a free tool or course page → requests a free trial in a short, low-friction form → receives clear confirmation and a sense of "what happens next."
2. **Enroll → Pay → Learn.** Guided enrollment wizard → plan selection with optional coupon → choice of payment (card, PayPal, or manual transfer) → clear success state → immediate path into first lesson.
3. **Manual-payment review.** For bank/transfer payers: a persistent, honest "your payment is under review" status that resolves to approved or needs-attention — never a dead one-time screen.
4. **Study loop.** Open a course → work through lessons → mark progress → feel momentum via streaks, XP, and milestones → earn a certificate.
5. **Quran & memorization.** Enter the reader → choose how to navigate (surah/page/juz/hizb) and how to read (continuous or verse-by-verse) → listen, repeat, record, and track memorization → resume exactly where they left off.
6. **Tutor's week.** Tutor sees their students → reviews and adds session records (grade, attendance, tajweed, homework notes) → schedules classes → messages students.
7. **Parent oversight.** Parent links a child with a code → views each child's progress, streak, and next class → receives a weekly summary.
8. **Staff operations.** Admin signs in securely → reviews the day (new enrollments, pending payments, moderation queue) → acts with confidence and an audit trail.

Full step detail: [User Flows](04_USER_FLOWS.md).

---

## 9. Every Required Screen (current surface, to be redesigned)

**Public & marketing**
- Home / landing
- Course category hub + individual course pages (Quran & Tajweed, Hifz, Ijazah, Islamic Studies, Arabic)
- Tools hub + each tool page (Quran reader, prayer times, qibla, Islamic calendar, tasbeeh, adhkar, hadith, Arabic alphabet, verse of the day, tajweed practice, hifz review)
- Resources hub, Blog list, Blog article, FAQ
- Academy hub, About, Tutors directory, Tutor profile, Privacy, Terms, Refund policy

**Auth & conversion**
- Login, Register, Forgot password, Reset password
- Enrollment wizard
- Payment result (success / cancelled)

**Student app**
- Student dashboard
- Course content / lesson player
- Billing & invoices
- Wishlist
- AI tutor chat
- Schedule / calendar
- Community feed
- Messages
- Profile

**Tutor app**
- Tutor dashboard (students, records, classes)

**Parent app**
- Parent dashboard (linked children & progress)

**Admin console**
- Secure admin sign-in
- Console overview
- People / users management
- Manual payments review
- Courses management
- Enrollments & trials
- Community moderation
- Reviews moderation
- Newsletter subscribers
- Classes management
- Staff management

Per-screen purpose and states: [Screen Inventory](05_SCREEN_INVENTORY.md).

---

## 10. Every Missing Screen (must be designed new)

These capabilities exist in the product but have **no proper screen** today. Stitch must create them.

**Learner-facing**
- **Subscription & plan management** — current plan, renewal date, change plan, cancel (with a graceful cancel flow).
- **Manual-payment status tracker** — persistent under-review / approved / action-needed state.
- **Unified "My Journey"** — one motivating view uniting progress, streak, XP, hifz, and milestones.
- **Certificates gallery** — all earned certificates, filter by type, view, share, and verify.
- **Referral center** — invite friends, see who joined, track earned reward days.
- **Hifz overview** — a memorization map of all 114 chapters with progress at a glance.
- **Full notification center** — a dedicated page (beyond the dropdown) with history and filtering.
- **Search results page** — a real results surface, not only a command palette overlay.
- **Account settings** — profile, security, language, notifications, connected accounts (see §44).
- **Onboarding** — first-run guidance for each role (see §43).
- **Branded maintenance / offline screen** — a calm, on-brand "we'll be right back."

**Tutor / parent**
- **Tutor class scheduler** — a real scheduling surface.
- **Per-student progress deep-dive** — analytics for one student.
- **Parent onboarding / link-a-child guide.**
- **In-app child weekly report** — the emailed summary, viewable in the product.

**Admin (confirmed gaps — powerful capabilities with no UI today)**
- **Coupon management** — create/edit/expire discount codes.
- **Blog authoring** — write and publish articles.
- **System controls** — maintenance mode and financial-freeze toggles, presented as a serious, guarded control panel.
- **Audit-log viewer** — searchable, immutable record of staff actions for compliance.
- **Admin analytics / KPI overview** — real numbers for revenue, enrollments, active learners, moderation backlog.
- **Certificate issuance workflow** — pick student → course → type → grade → issue.

Rationale for each: [Missing Screens](12_MISSING_SCREENS.md).

---

## 11. Every Required Modal

Modals are for focused, short, interruptive tasks. Use one consistent modal chrome everywhere.
- **Checkout** — plan + coupon + payment method selection.
- **Invoice viewer / print.**
- **Free-trial request** (quick capture).
- **Course resource / lesson attachment viewer.**
- **Verse card** (shareable Quran verse).
- **Certificate preview / print.**
- **Confirmation dialogs** — destructive actions (delete course, cancel subscription, revoke certificate, purge data) with clear consequence language.
- **Add / edit record** (tutor session record).
- **Link a child** (parent).
- **Quick-edit dialogs** in admin (edit user, edit coupon) where a full page would be overkill.
- **Milestone celebration** (a delightful, dismissible moment — not a blocking modal).

**Rule:** anything longer than a couple of fields or that benefits from a URL should be a screen or a drawer, not a modal.

---

## 12. Every Required Drawer

Drawers are for contextual detail and side tasks that keep the user anchored to the list behind them.
- **Notification center** (slide-in from the utility cluster).
- **Detail drawers in admin tables** — open a user, payment, enrollment, or moderation item beside the list without losing place.
- **Filter panels** — advanced filtering for tables and search.
- **Cart / checkout summary** (if a multi-item flow emerges).
- **Mobile navigation drawer** (full menu on small screens).
- **Tutor: student quick-view** from the roster.
- **Quran reader side panels** — surah/juz navigator, tafsir, notes & bookmarks (these are drawer-like companions to the reading canvas).

---

## 13. Every Required Form

Every form uses one consistent field pattern (label · control · helper · inline validation · clear error) and one save/submit convention with visible feedback.
- Register, Login, Forgot/Reset password
- **Enrollment wizard** (multi-step: learner details, scheduling preferences, subjects, level, plan)
- Checkout (plan, coupon, payment details entry where applicable)
- Trial request, Contact, Newsletter signup
- Profile & **account settings** (personal info, password/security, language, notification preferences)
- Tutor **session record** form (grade, attendance, memorization range, tajweed, homework, notes)
- Parent **link-a-child** form
- Admin: user create/edit, subscription adjust, **coupon editor**, **blog editor** (rich content), certificate issuance, moderation notes, staff invite
- Community: create post / comment
- Review submission
- AI tutor message composer

**Form principles:** one primary action, forgiving validation (validate on blur, not on every keystroke), never lose entered data, and always confirm success.

---

## 14. Every Required Table

Design **one** flexible data-table pattern (sortable, filterable, paginated, with row selection, row actions, and a detail drawer) and reuse it everywhere. Every table needs designed empty, loading, and error states.
- **Admin: Users** (search, role, subscription status)
- **Admin: Manual payments** (status, amount, method, review actions)
- **Admin: Enrollments & Trials**
- **Admin: Courses**
- **Admin: Community & Review moderation queues**
- **Admin: Newsletter subscribers**
- **Admin: Classes**
- **Admin: Staff**
- **Admin: Coupons** (new)
- **Admin: Audit log** (new — read-only, immutable feel)
- **Student: Invoices / billing history**
- **Tutor: Student roster** and **session records**
- **Parent: Children list**

**Table principles:** dense but readable, mobile via graceful card-stacking (not just horizontal scroll), consistent status badges, and quick actions that never require leaving the list.

---

## 15. Every Required Dashboard

Each role gets a purpose-built home that answers "what matters right now?" at a glance.
- **Student dashboard** — next class, continue-learning, streak & progress, upcoming/assigned work, quick links to Quran reader and AI tutor.
- **Tutor dashboard** — today's classes, students needing attention, recent records, quick actions.
- **Parent dashboard** — each child's snapshot (progress, streak, next class), weekly highlights.
- **Admin overview** — KPI header (revenue, active learners, new enrollments, pending payments, moderation backlog), recent activity, and fast entry to the busiest queues.

Dashboard philosophy in §36.

---

## 16. Every Reusable UI Pattern

The redesign is built from a small, disciplined kit of patterns:
- Buttons (primary, secondary, subtle/ghost, destructive, link) in a clear size range, with loading and icon variants
- One card system (content card, stat/KPI card, selectable card)
- One badge/status system (semantic colors for active/pending/success/warning/danger/info)
- One table pattern (§14)
- One modal + one drawer pattern
- One form-field pattern
- Tabs, accordion, pagination, breadcrumbs
- Toast/inline feedback, tooltip, menu/dropdown, command palette
- Empty-state, loading-skeleton, and error-state components (used consistently)
- Progress indicators (bar + ring), avatar, milestone celebration
- Navigation: mega-menu, sidebar, bottom nav, utility cluster
- Quran-specific: reading canvas, verse row, audio/recitation player, memorization controls, tafsir/notes panels

**Consolidation mandate:** today the product carries several overlapping generations of cards, badges, and modals. The redesign must ship **one** of each. See [Design System Requirements](09_DESIGN_SYSTEM_REQUIREMENTS.md).

---

## 17. Design System Requirements

Deliver a single, coherent, token-driven design system that themes light and dark, supports LTR and RTL, and covers every pattern in §16. It must feel like one product from the marketing home to the admin audit log.

Non-negotiables:
- One accent, one card, one badge, one modal — no duplicates.
- Semantic tokens for color, type, spacing, radius, elevation, and motion.
- Full RTL support designed intentionally.
- Light and dark themes at parity.
- Accessibility built into every component spec (§23).

---

## 18. Typography

- **Latin UI type:** a clean, humanist, modern sans for interface text — clear at small sizes, confident at display sizes. Calm and legible, in the spirit of premium SaaS.
- **Arabic type:** a refined, traditional-yet-readable Arabic face (Amiri-style) for Quran and Arabic content — treated with reverence and generous line height. Arabic is never an afterthought or a mechanical swap.
- **Editorial display:** an elegant serif for marketing and course-page headlines to convey heritage and gravitas.
- **Type scale:** a clear, limited hierarchy — display, headings (3–4 levels), body, small/caption, overline. Restraint over variety.
- **Principles:** generous line height for reading surfaces, tighter for dense UI; strong contrast between heading and body; the Prophet's honorific renders as the proper Unicode character ﷺ; German UI uses "Koran."

---

## 19. Color Philosophy

The palette is rooted in **Islamic manuscript tradition**, not generic SaaS.
- **Deep green** — the brand's spiritual core; primary actions, brand moments.
- **Manuscript amber/gold** — a single warm accent for highlights and celebration (choose one warm accent, not two).
- **Lapis blue** — a secondary brand tone for knowledge, lineage, and depth.
- **Warm cream neutrals** — the calm, paper-like foundation (never cold gray).
- **Semantic feedback** — restrained success/warning/danger/info hues that read clearly in both themes.

**Philosophy:** warm, reverent, and calm. Color carries meaning, not decoration. Dark mode is a deep, restful green-black — a night-reading mode fitting for a Quran product. Accessibility contrast is a requirement, especially for the amber accent on light surfaces.

---

## 20. Spacing System

- A consistent spacing scale on a small base unit, applied everywhere — no arbitrary values.
- **Generosity is part of the brand.** Reading and sacred surfaces get extra breathing room; dense operational surfaces (admin tables) tighten but stay legible.
- Consistent page gutters, section rhythm, and component padding create the calm, premium feel. Whitespace is a feature, not wasted space.

---

## 21. Component Philosophy

- **One source of truth per pattern.** Every card is the same card; every modal is the same modal.
- **Composable, not bespoke.** Screens are assembled from shared components; a new screen should rarely need a new primitive.
- **Stateful by design.** Every component ships its loading, empty, error, disabled, and success states — states are designed, not left to chance.
- **Accessible by construction.** Focus, keyboard, and screen-reader behavior are part of the component definition.
- **Restrained.** Fewer, better components beat many overlapping ones.

---

## 22. Responsive Behavior

Design mobile-first, but deliver a genuinely excellent experience at every size. Three deliberate breakpoint intents: **mobile**, **tablet**, **desktop** (details in §29–§31). Content reflows and re-prioritizes — it is never merely scaled. Tables become cards, sidebars become drawers/bottom-nav, and reading surfaces adapt their controls to touch.

---

## 23. Accessibility Requirements

Accessibility is a first-class requirement, not a pass at the end.
- Full keyboard operability for every interactive element and flow.
- Visible, consistent focus states.
- Screen-reader-friendly structure, labels, and announcements (especially forms, tables, modals, and the Quran reader).
- WCAG AA color contrast in both themes — audit the amber accent carefully.
- Respect reduced-motion preferences (calm alternatives to animation).
- Correct, intentional RTL for Arabic — mirroring, alignment, and reading order.
- Touch targets sized comfortably for mobile.

---

## 24. Loading States

- Use **skeletons** that mirror the final layout for content areas (dashboards, lists, reader) — no layout shift when data arrives.
- Use inline spinners only for small, in-place actions (buttons, toggles).
- Long or human-in-the-loop operations (payment processing, AI tutor streaming) show **progressive, reassuring** feedback, not a frozen screen.
- Loading never blocks the whole app when only one region is loading.

---

## 25. Empty States

Every list, table, feed, and collection has a **designed** empty state that:
- Explains what belongs here.
- Offers the primary next action (e.g., "Browse courses," "Invite a child," "Add your first record").
- Feels encouraging and on-brand, never like a bug or a blank void.
Priority empties: wishlist, billing, messages, community, parent-with-no-children, admin queues, notifications, certificates.

---

## 26. Error States

- **Inline validation** for forms — specific, human, next to the field.
- **Recoverable errors** (network, load failure) show a calm message plus a retry — never a raw error.
- **Blocking errors** use a friendly full-region or full-page state with a clear way forward.
- **Guarded/forbidden actions** are hidden or disabled with explanation, never shown broken.
- Consistent error voice across the product: clear, kind, and actionable.

---

## 27. Success States

- Every meaningful action confirms itself: a toast for quick actions, an inline confirmation for saves, a dedicated success screen for major milestones (payment complete, certificate earned, enrollment submitted).
- Celebrate genuine achievements (streaks, memorization milestones, certificates) with a tasteful, dismissible moment of delight — reverent, not gamey-loud.
- Success states always tell the user what happens next.

---

## 28. Animation Guidelines

- **Purposeful and subtle.** Motion guides attention, communicates hierarchy, and smooths transitions — it never performs.
- Gentle easing, short durations; content settles calmly.
- Enter/exit for modals, drawers, toasts, and menus; soft reveals for content sections.
- The Quran reader and reading surfaces are especially restrained — stillness supports focus.
- Always honor reduced-motion preferences with a calm, static alternative.

---

## 29. Mobile Behavior

- Bottom tab bar for the top role destinations; full menu in a slide-in drawer.
- Tables become stacked cards; filters move into a drawer/sheet.
- One primary action per screen, thumb-reachable.
- Reader adapts controls for touch (larger targets, swipe navigation, simplified control matrix).
- Forms are single-column, with large inputs and clear step progress in the enrollment wizard.

---

## 30. Desktop Behavior

- Unified sidebar + top utility bar; multi-column dashboards and detail-beside-list patterns (list + drawer).
- Keyboard-first affordances: global search / command palette, shortcuts for power users (especially admin and reader).
- Comfortable information density in admin without sacrificing calm.
- Reading surfaces use the extra width for a focused, centered canvas — not edge-to-edge clutter.

---

## 31. Tablet Behavior

- A deliberate middle ground: collapsible sidebar (icon-rail or drawer), two-column where it helps, single-column where clarity wins.
- Touch-friendly targets with desktop-level capability.
- The Quran reader shines here — treat tablet as a primary reading device and design its layout intentionally.

---

## 32. Interaction Patterns

- One obvious primary action per screen; secondary actions clearly subordinate.
- Consistent placement: primary actions bottom-right in dialogs, top-right on pages.
- Destructive actions always confirm, with consequence-specific language.
- Optimistic, responsive feedback; never leave the user wondering if a tap registered.
- Command palette for fast navigation and search (discoverable, not hidden).
- Consistent selection, hover, focus, active, and disabled treatments across all components.

---

## 33. Notification Patterns

- **One unified notification center** — merge today's two competing bells into a single concept covering system notifications and messages, with clear categorization.
- A single bell in the utility cluster with an unread indicator; a slide-in panel for recent items; a full notification page for history and filtering.
- **Toasts** for transient action feedback (success/error), auto-dismiss with an accessible pause/dismiss.
- Respectful frequency — the product informs, it does not nag.

---

## 34. Search Behavior

- A prominent, always-available global search in the utility cluster, plus a keyboard-invoked command palette.
- Search spans courses, tutors, content, and (for staff) operational records.
- Results are **grouped and typed** (courses, tutors, articles, people) with clear affordances.
- A dedicated **search results page** for deeper exploration beyond the overlay.
- Instant feedback, sensible empty and loading states, and forgiving matching.

---

## 35. Filtering Behavior

- Consistent filtering across all tables and search: a shared filter pattern (chips for active filters, a filter drawer/panel for advanced options).
- Filters are visible, removable, and combinable; active filters are always shown as dismissible chips.
- Sensible defaults; "clear all" always available.
- Filter state feels persistent within a session and, where useful, shareable via URL.

---

## 36. Dashboard Philosophy

Dashboards answer **"what needs my attention right now?"** in the first screenful.
- Lead with the few numbers/actions that matter for that role; push detail below or into dedicated screens.
- Every dashboard offers immediate next actions, not just passive stats.
- Consistent card grid, consistent KPI treatment, consistent "recent activity" pattern.
- Calm and scannable — a dashboard should reduce anxiety, not create it. Never a wall of charts for their own sake.

---

## 37. Premium SaaS Quality Goals

The bar is Stripe, Linear, Notion, and Vercel. Concretely:
- **Pixel discipline** — consistent spacing, alignment, and type rhythm on every screen.
- **State completeness** — no undesigned loading, empty, or error moment anywhere.
- **Motion polish** — subtle, purposeful, cohesive.
- **Coherence** — the marketing home and the admin audit log clearly belong to the same product.
- **Speed feel** — skeletons, optimistic feedback, and instant transitions make it feel fast.
- **Trust cues** — security, payments, and data are presented with obvious care.
- **Delight in the details** — the empty states, the reader, the celebration moments are where users fall in love.

---

## 38. UX Consistency Rules

1. One component per pattern — always the same button, card, table, modal.
2. One notification concept, one bell.
3. Utility controls (search, language, theme, notifications, account) appear once per viewport, in one place.
4. Primary action placement is consistent everywhere.
5. Status is always communicated with the same badge system and colors.
6. Every list/table has the same empty, loading, and error treatment.
7. Destructive actions always confirm; success always confirms.
8. The same terminology everywhere ("tutor" in English UI, brand spelled "Al-Rahma," "Koran" in German).
9. RTL behaves consistently and correctly across the whole product.
10. No screen invents a one-off pattern when a shared one exists.

---

## 39. Screens That Should Be Merged

- **Public shell + dashboard shell → one adaptive shell.** A logged-in learner should never feel they left the app to use a free tool.
- **The two notification bells → one notification center** (§33).
- **Scattered progress widgets → one "My Journey"** surface (§10).
- **Duplicated utility controls across shells → one shared utility cluster.**
- **Redundant course landing patterns** — unify the several course pages into one consistent course-page template with content variations, not bespoke layouts.

---

## 40. Screens That Should Be Split

- **The admin console (today one page with hidden tab states) → route-native sections.** Each admin area (People, Payments, Content, Moderation, System) is its own deep-linkable, back-button-correct screen with its own detail views.
- **Overloaded shared screens** (schedule, homework, attendance, messages that branch by role) → give each role the view it actually needs, rather than one screen doing everything ambiguously.
- **Profile → Profile + Account Settings** — separate "who I am" from "manage my account" (security, billing, language, notifications).
- **Quran reader control matrix** — separate concerns clearly: navigation, reading mode, audio, and memorization are distinct control groups, not one dense cluster.

---

## 41. Features That Deserve Dedicated Screens

These are real capabilities buried in components, dropdowns, or the backend that deserve their own front-door screens:
- Subscription & plan management
- Certificates gallery
- Referral center
- Hifz / memorization overview (all 114 chapters)
- Full notification center
- Search results
- Coupon management (admin)
- Blog authoring (admin)
- System controls / kill-switches (admin)
- Audit-log viewer (admin)
- Admin KPI analytics overview
- Manual-payment status (learner)

---

## 42. Missing Workflows

- **Subscription lifecycle** — upgrade/downgrade, cancel (with a graceful cancel-survey flow), reactivate, and see renewal clearly.
- **Guest-checkout → account claiming** — a clear path to attach a payment made without an account to a newly created one.
- **Certificate issuance (staff)** — an end-to-end guided flow.
- **Coupon lifecycle (staff)** — create, distribute, monitor usage, expire.
- **Content publishing (staff)** — draft → review → publish for blog and course content.
- **Moderation resolution** — a clear queue-to-decision flow for community and reviews.
- **Parent linking** — a guided, reassuring connect-a-child flow.

---

## 43. Missing Onboarding

There is no first-run guidance today. Design lightweight, role-aware onboarding:
- **Student onboarding** — welcome, set goals/level, find your first course, meet the Quran reader.
- **Tutor onboarding** — how to find your students, log a record, schedule a class.
- **Parent onboarding** — how to link a child and read the weekly report.
- **Admin onboarding** — a brief orientation to the console and its guarded controls.
Onboarding is skippable, resumable, and never blocks capable users.

---

## 44. Missing Settings

Design a proper **Account Settings** area (its own section, not buried in Profile):
- Personal information
- Security (password, and a clear, reassuring two-factor experience for staff)
- Language & region (all six languages, RTL)
- Theme (light/dark/system)
- Notification preferences (channels and categories)
- Connected accounts (e.g., Google)
- Danger zone (close account / data requests), presented carefully

---

## 45. Missing Account Management

- **Billing & subscription home** — plan, renewal, payment method, invoices, and the manual-payment status all in one clear place.
- **Sessions & security** (staff especially) — see and manage active sessions.
- **Data & privacy** — export/delete requests handled with dignity.
- **Family/relationships** — parents managing multiple children; students seeing their linked tutor and parent.

---

## 46. Missing Administration Capabilities

Surface the powerful operations that currently have no interface, as first-class, trustworthy console screens:
- Coupon management
- Blog / content authoring & publishing
- **System controls** — maintenance mode and financial-freeze, presented as a serious, confirmation-guarded control panel with clear status and consequences.
- **Audit-log viewer** — searchable, read-only, immutable-feeling record of every staff action, for compliance.
- **Analytics / KPI overview** — revenue, enrollments, active learners, moderation backlog.
- **Certificate issuance workflow.**
- **Role & permission management** — assign staff roles and see exactly what each can do.

---

# Instructions for Google Stitch

**Your mission:** redesign the **entire** Al-Rahma Academy product from the ground up as one cohesive, premium, multilingual design system and screen set. Do not treat this as a reskin of existing screens. Reimagine the whole experience to the quality bar of Stripe, Linear, Notion, and Vercel — while keeping it warm, reverent, calm, and Arabic-first.

**Scope**
1. **Redesign every current screen** listed in §9.
2. **Create every missing screen** in §10, §41–§46 — do not stop at what exists today. Where this brief identifies a needed screen, workflow, setting, onboarding step, or admin capability, **design it**.
3. **Build one design system first** (§16–§21): a single token-driven library — one accent, one card, one badge, one table, one modal, one drawer, one form-field — themed for light and dark and fully RTL. Every screen is assembled from it.

**How to approach it**
- Start from the **design system and core patterns**, then compose screens from them. Consistency comes from the kit, not from per-screen effort.
- **Merge** what should be merged (§39) — especially the two shells into one adaptive shell, and the two bells into one notification center.
- **Split** what should be split (§40) — especially make the admin console route-native and separate Profile from Account Settings.
- Give **each role** a purpose-built dashboard and a navigation experience tailored to them (§6, §7, §15, §36).
- Treat the **Quran reader as the hero** surface — design it as a beautiful, focused reading and memorization environment across mobile, tablet, and desktop.
- Design **every state** for every screen: loading (skeletons), empty (encouraging, actionable), error (calm, recoverable), success (confirming, occasionally delightful). No undesigned states.
- Make it **responsive with intent** across mobile, tablet, desktop (§29–§31) — reflow and re-prioritize, never merely scale.
- Bake in **accessibility and RTL** at the component level (§23).

**Quality bar (hold yourself to this)**
- Pixel-consistent spacing, alignment, and type rhythm on every screen.
- One coherent visual language from the marketing home to the admin audit log.
- Subtle, purposeful motion; polished micro-interactions.
- Warm, reverent, calm — never cold, corporate, or noisy.
- Trust made visible in payments, security, and data.

**Explicit permission & instruction:** you are **not limited to the current screens.** If a great product needs additional screens, flows, onboarding, settings, or admin tools to feel complete and premium, **create them.** Fill every gap this brief identifies, and any others good design demands, so the finished product feels like a world-class, modern SaaS academy — serene, trustworthy, and beautifully crafted.

**Brand guardrails (must respect):** the name is **Al-Rahma**; the teaching role is **tutor** in English UI; German uses **Koran**; the Prophet's honorific is the Unicode character **ﷺ**; the palette is warm cream + deep green + a single warm accent + lapis, in the spirit of Islamic manuscript tradition; Arabic and RTL are first-class throughout.
