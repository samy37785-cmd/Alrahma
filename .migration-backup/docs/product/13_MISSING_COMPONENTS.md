# 13 — Missing Components

> Reusable UI components that should exist but don't, inferred from repeated ad-hoc patterns and gaps in the current component set ([06_COMPONENT_INVENTORY.md](06_COMPONENT_INVENTORY.md)) and design system ([09_DESIGN_SYSTEM_REQUIREMENTS.md](09_DESIGN_SYSTEM_REQUIREMENTS.md)).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md).

Each entry: what's missing, why it's needed (evidence), and what it would replace.

---

## 1. Structural / state components

| Missing component | Why needed | Replaces |
|---|---|---|
| **`EmptyState`** | No shared empty-state exists; every data page (Wishlist, Billing, Messages, Community, ParentDashboard, admin queues) handles "no data" ad hoc → inconsistency ([10](10_UX_PROBLEMS.md) §2). | Per-page bespoke empty markup |
| **`ErrorState` / `QueryBoundary`** | React Query `isError` handling is uneven; a standard error panel + retry tied to query state is missing ([10](10_UX_PROBLEMS.md) §8.2). | Ad-hoc error branches |
| **`DataTable`** | Admin tabs (`AdminUsersTab`, `AdminPaymentsTab`, …) each reimplement table + pagination + search over `.ds-table`. A generic table (sort/filter/paginate/select) would unify them ([06](06_COMPONENT_INVENTORY.md) §6). | Repeated table code per admin tab |
| **`Toast`/notification host (React)** | `.ds-toast` CSS exists, but a documented React toast provider/host for imperative success/error feedback isn't in the component inventory. **[needs verification]** whether one exists. | Inconsistent inline feedback |

## 2. Form components

| Missing component | Why needed | Replaces |
|---|---|---|
| **`FormField`** (label + control + error + hint) | Forms use React Hook Form directly; a standard field wrapper enforcing the input/focus/error token styling ([09](09_DESIGN_SYSTEM_REQUIREMENTS.md) §6) is not catalogued. Would guarantee consistent validation display of the `{message}` contract. | Per-form field markup |
| **Input primitives set** (`TextInput`, `Select`, `Checkbox`, `Radio`, `Textarea`, `DatePicker`) | No dedicated input components are listed in `ui/`; controls are styled via CSS classes. A typed primitive set is standard for a DS. **[needs verification]** exact current inputs. | Raw HTML controls + CSS |

## 3. Navigation / shell components

| Missing component | Why needed | Replaces |
|---|---|---|
| **Unified `NotificationCenter`** | Two independent bells (message + notification) with separate polling ([10](10_UX_PROBLEMS.md) §4.1). A single component would merge both. | Header message bell + `NotificationPanel` |
| **Shared utility cluster** (theme/lang/search/notifications) | These controls are duplicated across Header and DashboardLayout ([11](11_DESIGN_OPPORTUNITIES.md) §2). A shared cluster removes duplication. | Duplicated controls in two shells |
| **`StatusBadge` (subscription/payment/moderation)** | Status is rendered many ways (subscription active/expired, payment pending/approved, post pending/approved, certificate revoked). A single semantic status badge would standardize. | Various `.badge`/`.ds-badge` usages |

## 4. Domain components

| Missing component | Why needed | Replaces |
|---|---|---|
| **`SubscriptionCard` / billing-status** | Backend models full lifecycle but no student-facing subscription status component exists ([12](12_MISSING_SCREENS.md) §B). | — (gap) |
| **`ProgressJourney` / learning-loop widget** | Progress, XP, hifz, certificates are separate cards; no component ties the loop together ([11](11_DESIGN_OPPORTUNITIES.md) §8). | Scattered dashboard cards |
| **`AuditLogTable`** | Immutable audit log has an API but no viewer component ([12](12_MISSING_SCREENS.md) §F). | — (gap) |
| **`CouponEditor` / `BlogEditor`** | Confirmed: full backend CRUD for coupons and blog with **no admin UI** ([12](12_MISSING_SCREENS.md) §F, verified). | — (gap) |
| **`SystemControls` (kill-switch panel)** | `maintenance_mode` / `financials_frozen` toggles have no dedicated admin component. | — (gap) |

## 5. Consolidation (components that exist but are fragmented)

| Target | Current state | Opportunity |
|---|---|---|
| **Single `Card`** | `.card` (components.css) + `.ds-card` (dashboard-shell.css) | One card primitive ([09](09_DESIGN_SYSTEM_REQUIREMENTS.md) §7) |
| **Single `Badge`** | `.badge` + `.ds-badge` | One badge primitive |
| **Single `Modal`** | `Modal.jsx` canonical, 2 exceptions remain | Finish migration ([ADR 0002](../adr/0002-single-modal-component.md)) |
| **Single accent** | gold `#d4af37` + amber `#c8842a` tokens | One accent |

---

## Priority missing components

1. **`EmptyState` + `ErrorState`/`QueryBoundary`** — immediate consistency win across every data page.
2. **`DataTable`** — collapses admin-tab duplication.
3. **`FormField` + input primitives** — foundational for the DS.
4. **`NotificationCenter`** — resolves the dual-bell confusion.
5. **`CouponEditor` / `BlogEditor` / `SystemControls` / `AuditLogTable`** — surface already-built backend power (confirmed gaps).

Several items are marked **[needs verification]** where a component may exist under a different name — confirm against `components/ui/` before treating as a true gap. The confirmed gaps (coupon/blog editors, system controls, audit viewer, subscription status) are backed by existing APIs with no consuming UI.
