# Al-Rahma Academy — Master Product Specification

> Single, professional reference that stitches together the complete reverse-engineering documentation set. This is the intended **source of truth for a from-scratch UI/UX redesign**. Every claim in the linked documents is grounded in the current source code; items that could not be confirmed from code are flagged **[needs verification]** in place.

**Scope & method.** This documentation was produced by reading the repository (frontend, backend, models, routes, controllers, services, middleware, config, styles, tests, and existing docs) — no code was modified. It describes the product **as it exists today**, including complete, mock, static, hidden, and deprecated features. It does **not** propose an implementation; it captures what to preserve, what to fix, and what's missing.

---

## Document index

| # | Document | Covers |
|---|---|---|
| 01 | [Product Overview](01_PRODUCT_OVERVIEW.md) | Business goals, target users, main modules, architecture, tech stack |
| 02 | [Information Architecture](02_INFORMATION_ARCHITECTURE.md) | Every screen, navigation shells, full route table, redirects |
| 03 | [User Roles](03_USER_ROLES.md) | Two identity systems, RBAC permission matrix, restrictions |
| 04 | [User Flows](04_USER_FLOWS.md) | Auth, enrollment, payment, courses, teacher, parent, certificates, notifications |
| 05 | [Screen Inventory](05_SCREEN_INVENTORY.md) | Per-screen purpose, inputs, outputs, states, dependencies |
| 06 | [Component Inventory](06_COMPONENT_INVENTORY.md) | Reusable components, props, responsibilities, reuse |
| 07 | [Feature Inventory](07_FEATURE_INVENTORY.md) | Every feature, maturity labels, hidden/deprecated |
| 08 | [API Mapping](08_API_MAPPING.md) | Every endpoint: method, path, guards, consumers, errors |
| 09 | [Design System Requirements](09_DESIGN_SYSTEM_REQUIREMENTS.md) | Tokens, scales, primitives, dark mode |
| 10 | [UX Problems](10_UX_PROBLEMS.md) | Code-grounded UX issues by severity |
| 11 | [Design Opportunities](11_DESIGN_OPPORTUNITIES.md) | Improvement opportunities (no redesign) |
| 12 | [Missing Screens](12_MISSING_SCREENS.md) | Screens implied but absent |
| 13 | [Missing Components](13_MISSING_COMPONENTS.md) | Reusable components that should exist |

Companion engineering docs (kept current by the team): [ARCHITECTURE](../ARCHITECTURE.md) · [API](../API.md) · [ADRs](../adr/) · [ROUTE_CONSOLIDATION_PLAN](../ROUTE_CONSOLIDATION_PLAN.md) · [../../CLAUDE.md](../../CLAUDE.md).

---

## 1. Executive summary

**Al-Rahma Academy** is a multilingual (6 locales, incl. RTL Arabic) online Islamic education platform: a React 18 SPA (Vercel) + Express 4 API (Render) + MongoDB Atlas, with GitHub-Actions cron. It sells subscription tuition (Quran/Tajweed, Hifz, Ijazah, Arabic, Islamic Studies — 3 EUR plans, server-authoritative pricing) and surrounds it with a large free funnel (Quran reader, Islamic tools, blog). It coordinates live 1:1 classes, teacher records, and parent oversight, and is operated through a hardened admin console (TOTP MFA, RBAC, IP whitelist, immutable audit log, kill-switches).

The product is **feature-rich and largely complete**, with a **strong 3-layer semantic design-token foundation** — but it carries **fragmentation debt** (four overlapping component-CSS generations, two accent colors, dual notification bells, two nav shells) and a few **honest-data surfaces** (mock Homework/Attendance, static teacher directory) that a redesign must resolve deliberately. Several powerful backend capabilities (coupons, blog authoring, system controls, audit log, subscription lifecycle) **lack any UI** — confirmed gaps, not guesses.

---

## 2. Architecture at a glance

```
Browser ─► Vercel (React SPA)  ──/api/*──►  Render (Express, node server.js)  ─►  MongoDB Atlas
GitHub Actions ──Bearer CRON_SECRET──► /api/cron/*
```
- **Frontend providers:** ErrorBoundary → QueryProvider → ThemeProvider → LangProvider → AuthProvider → AdminAuthProvider → BrowserRouter.
- **Backend pipeline:** helmet → cors → raw(stripe) → correlationId → json → cookies → sanitizeMongo → CSRF → logger → health → apiLimiter → db-check → routes → errorHandler.
- **Two route stacks:** legacy (`protect`/role) vs admin v1 (`/api/v1/admin/*`, full RBAC + audit).

Details: [01](01_PRODUCT_OVERVIEW.md) §5, [08](08_API_MAPPING.md).

---

## 3. Roles & access (summary)

Two **separate** identity systems ([03](03_USER_ROLES.md)):
- **App users** (`User.role`): `student | teacher | parent | admin` — simple middleware guards.
- **Admin operators** (`AdminUser`): `super-admin | admin | editor | viewer` — RBAC permission strings + TOTP MFA + IP whitelist. The `/admin` console requires **both** a `User{role:admin}` and a separate `AdminUser` MFA session.

Two permission strings (`system:maintenance`, `system:kill-switch`) are **defined but unused** (verified). RBAC matrix in [03](03_USER_ROLES.md) §3.

---

## 4. Feature maturity map

| Maturity | Examples |
|---|---|
| ✅ Complete | Auth, admin MFA, payments (Stripe/PayPal/manual), courses+progress, Quran reader+hifz, certificates, notifications, messaging, community, reviews, AI tutor, teacher/parent, live classes, referrals+gamification, blog (live), admin console (10 tabs) |
| 🟠 Preview/mock (no backend) | **Homework**, **Attendance** |
| ⚪ Static editorial (no accounts) | **Public teacher directory** |
| 🟡 Client-only / external API | Islamic tools (tasbeeh, qibla, prayer times, calendar, alphabet, adhkar) |
| 🕳️ Hidden/secondary | Kill-switches, gamification internals, command palette, exit-intent/cancel survey |
| ⚠️ Confirmed UI gap (API exists) | Admin coupon editor, admin blog editor, system controls, audit-log viewer, subscription-management |

Full detail: [07](07_FEATURE_INVENTORY.md), [12](12_MISSING_SCREENS.md).

---

## 5. Design system (summary)

Strong foundation to **preserve**: 3-layer semantic tokens; brand identity = green `#0b6e4f` + manuscript amber `#c8842a` + lapis `#1a3a6b` on warm-cream neutrals; Poppins/Amiri(RTL)/Playfair; 4px spacing; full radius/shadow/motion scales; token-flip dark mode with e2e baselines.

Debt to **resolve**: four component-CSS generations (two card systems, two badge systems), two accent colors, incomplete modal migration, backward-compat primitives. Full spec + requirements checklist: [09](09_DESIGN_SYSTEM_REQUIREMENTS.md).

---

## 6. Top redesign priorities (consolidated)

From [10](10_UX_PROBLEMS.md), [11](11_DESIGN_OPPORTUNITIES.md), [12](12_MISSING_SCREENS.md), [13](13_MISSING_COMPONENTS.md):

1. **Consolidate the design system** — one card/badge/accent/modal on the existing token base.
2. **Resolve honest-data surfaces** — decide the fate of Homework/Attendance (build or demote) and the static teacher directory.
3. **Introduce shared state components** — `EmptyState`, `ErrorState`/`QueryBoundary`, `DataTable`, `FormField`.
4. **Unify notifications** — one `NotificationCenter`, replacing the dual bells.
5. **Surface the hidden power** — build UIs for coupons, blog authoring, system controls, audit log, subscription management (all have backends).
6. **Elevate the Quran reader** as the signature experience.
7. **Make the admin console route-native** and add a real KPI overview.
8. **Bake in a11y + RTL** at the component-spec level.

---

## 7. How to use this spec for a redesign

1. **Preserve** what [09](09_DESIGN_SYSTEM_REQUIREMENTS.md) marks as foundation (tokens, brand, RTL, dark mode) and the complete backend surface in [08](08_API_MAPPING.md) — the API is stable and should drive the new UI.
2. **Rebuild the UI layer** against [05](05_SCREEN_INVENTORY.md) (screens), [06](06_COMPONENT_INVENTORY.md) (components), and the role/flow contracts in [03](03_USER_ROLES.md)/[04](04_USER_FLOWS.md).
3. **Fix** the issues in [10](10_UX_PROBLEMS.md) and pursue [11](11_DESIGN_OPPORTUNITIES.md).
4. **Fill** the gaps in [12](12_MISSING_SCREENS.md)/[13](13_MISSING_COMPONENTS.md).
5. **Verify** every **[needs verification]** flag against source before relying on it.

---

## 8. Verification & confidence notes

- **High confidence (read from source):** route table, endpoint/guard mapping, model fields, RBAC matrix, design tokens, feature wiring, the mock/static surfaces, and the confirmed admin UI gaps (coupons/blog).
- **Flagged [needs verification]:** exhaustive per-page state coverage, some marketing-widget data sources (live vs illustrative), admin "Overview" content depth, and whether a few components (toast host, input primitives, maintenance screen) exist under other names. These require opening the specific files.
- **Out of scope of code:** commercial targets, real conversion metrics, and go-to-market — inferred goals only.

This document set aims for near-100% coverage of the product surface as expressed in code. Where reality and description could diverge (runtime-only behavior), the text says so rather than guessing.
