# 09 — Design System Requirements

> The complete design foundation extracted from the current codebase — tokens, scales, and primitives — everything a future Design System must reproduce or deliberately replace. Values below are transcribed from source. Primary source: [frontend/src/styles/tokens.css](../../frontend/src/styles/tokens.css) and the CSS layers imported by [styles.css](../../frontend/src/styles/styles.css).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md). Component catalogue: [06_COMPONENT_INVENTORY.md](06_COMPONENT_INVENTORY.md).

---

## 0. Architecture of the current system

- **3-layer semantic token system** ([tokens.css](../../frontend/src/styles/tokens.css)): Layer 1 primitives (`--p-*`, never used directly) → Layer 2 semantic tokens (`--color-*`, `--bg-*`, `--text-*`, …, what components reference) → Layer 3 dark overrides (`html.dark` flips **semantic tokens only**).
- **CSS import order** (in `styles.css`, must be preserved): `tokens → global → layout → auth → pages → components → design-system → dark → responsive` (**responsive.css must stay last**). Page-specific CSS is code-split (imported by its page, not the index).
- **Rule:** components reference only semantic tokens. Backward-compat primitives (`--green`, `--gold`, `--ink`, `--radius`, `--shadow`, `--grad-*`) are retained for unmigrated legacy components — a rebuild should treat these as deprecated.

---

## 1. Color

### Brand palette (Layer 1 primitives)
| Family | Role | Key stops |
|---|---|---|
| **Green** | Brand primary | `--p-green-500 #0b6e4f` (primary), `-800 #06372a` (deep), `-950 #00241f` (deepest) |
| **Gold** | Legacy accent | `--p-gold-500 #d4af37` |
| **Manuscript Amber** | **Current accent** (replaces harsh gold) | `--p-amber-500 #c8842a` |
| **Lapis Blue** | 3rd brand color (knowledge/lineage) | `--p-lapis-500 #1a3a6b` |
| **Warm neutrals** | Surfaces/text | `-0 #fff` → `-50 #f8f6ef` (cream) → `-800 #1a2622` (ink) → `-900 #0d1712` |
| Feedback | success/warning/danger/info | `#16a34a / #d97706 / #dc2626 / #0284c7` |

### Semantic color tokens (Layer 2 — what to build against)
- **Backgrounds:** `--bg-page` (cream), `--bg-surface` (white), `--bg-surface-raised`, `--bg-surface-hover`, `--bg-overlay` (modal backdrop `rgba(6,55,42,.55)`), `--bg-input`, `--bg-input-focus`, `--bg-disabled`, `--bg-skeleton` (+wave), `--bg-hero` (green gradient), `--bg-tooltip`, `--bg-code`.
- **Text:** `--text-primary` (ink), `--text-secondary` (muted), `--text-disabled`, `--text-inverse`, `--text-brand`, `--text-brand-strong`, `--text-accent`, `--text-lapis`, + feedback text tokens.
- **Interactive color sets** — each with `hover / active / surface / border / text`: `--color-primary` (green), `--color-accent` (amber), `--color-lapis`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`.
- **Borders:** `--border-default/strong/subtle/brand/accent/danger/input/input-focus`.

**Requirement:** the rebuild must preserve this three-color brand identity (green + manuscript amber + lapis) and the warm-cream neutral base — this is a deliberate Islamic-manuscript aesthetic, not a generic SaaS palette.

---

## 2. Typography

| Token group | Values |
|---|---|
| **Font families** | `--font-sans` = Poppins; `--font-serif` = **Amiri (Arabic only)**; `--font-serif-display` = Playfair Display (editorial headlines); `--font-mono` = Fira Code |
| **Size scale** | `--text-xs .72rem` · `sm .82` · `base .92` (dashboard body) · `md 1rem` · `lg 1.125` · `xl 1.25` · `2xl 1.5` · `3xl 1.875` · `4xl 2.25` · `5xl 3rem` · `--text-hero clamp(2.6rem,5.5vw,3.8rem)` |
| **Weights** | 400 / 500 / 600 / 700 / 800 / 900 (`normal`→`black`) |
| **Line height** | tight 1.15 · snug 1.35 · normal 1.5 · relaxed 1.65 · loose 1.8 |
| **Letter spacing** | tight −0.02em · normal · wide 0.03 · wider 0.06 · widest 0.12 · overline 0.15em |

**Requirements:** Arabic must render in Amiri (self-hosted, lazy-loaded except on Arabic-heavy pages which call `loadArabicFontsNow()`). Brand wordmark uses Cinzel/Cairo (self-hosted, in `BrandLockup`). The Prophet honorific renders as the Unicode character **ﷺ**, never a traced glyph. German UI uses **Koran** (not "Quran").

---

## 3. Spacing, radius, shadow, motion

| Scale | Values |
|---|---|
| **Spacing** (4px base) | `--space-1 4px` → `-2 8` · `-3 12` · `-4 16` · `-5 20` · `-6 24` · `-8 32` · `-10 40` · `-12 48` · `-16 64` · `-20 80` · `-24 96px` |
| **Radius** | `xs 4` · `sm 8` · `md 12` · `lg 16` · `xl 24` · `2xl 32` · `full 9999` |
| **Shadow** | `xs → xl` (green-tinted `rgba(8,77,55,…)`), `--shadow-gold`, `--shadow-inner`, `--shadow-focus` |
| **Focus ring** | `--ring-color` green, `--ring-width 2px`, `--ring-offset 2px`, `--ring-shadow` |
| **Motion** | `--transition-*` tokens; `prefers-reduced-motion` zeroes all durations (accessibility requirement) |
| **Z-index** | semantic scale `--z-below … --z-top` |
| **Layout** | sidebar/layout width tokens |

---

## 4. Dark mode

- Approach: `html.dark` (Layer 3) overrides **semantic token values only** — components don't change, tokens flip.
- Dark values: backgrounds → deep green-black (`#0d1712` / `#152010`), text → `#dceee5`, brand accent → brighter `#4fd19a`, shadows → black-based.
- Managed by [ThemeContext](../../frontend/src/context/ThemeContext.jsx) (`html.dark`, persisted `al-rahma-theme`). **Dark-mode visual regression baselines exist** ([e2e/dark-mode.spec.mjs](../../e2e/dark-mode.spec.mjs)).
- **Requirement:** any redesign must theme both modes at the token layer and keep the light+dark e2e baselines green.

---

## 5. Component primitives (must be reproduced)

The current system spans **four CSS namespaces with zero selector collisions** (do not add a fifth). A redesign should ideally **consolidate** these, but must cover the same primitives:

### 5.1 Buttons — `.btn` (`global.css`)
- Variants: `--primary/green`, `--accent/gold`, `--secondary`, `--outline`, `--ghost`, `--ghost-inv`, `--danger/destructive`, `--success`, `--warning`, `--link`.
- Sizes: `--xs / sm / md / lg / xl`. Modifiers: `--block`, `--icon`, `--loading` (+ `__spinner`).

### 5.2 Cards & badges — `components.css`
- `.card` (+ `--clickable`, `--selected`, accent variants; subparts `__header/title/description/body/footer/divider`).
- `.badge` (+ `--sm/lg/square`; colors `--default/primary/success/warning/danger/info/accent/muted`).

### 5.3 Dashboard shell — `dashboard-shell.css`
- `.ds-card`, `.ds-badge` (green/red/yellow/blue/gray/gold/purple), `.ds-table` / `.ds-table-wrap`.

### 5.4 Newest DS layer — `design-system.css`
- `.ds-modal` (+ `--sm/md/lg/xl`; `__header/title/subtitle/close/body/footer`), `.ds-drawer`, `.ds-toast` (success/warning/danger/info), `.ds-tooltip` (4 directions), `.ds-menu`, `.ds-tabs`/`.ds-tab`, `.ds-accordion`, `.ds-pagination`, `.ds-progress`, animation utilities `.ds-reveal` / `.ds-stagger`.

### 5.5 Primitive components (React, `components/ui/`)
`Avatar`, `Breadcrumbs`, `ProgressRing`, `Skeleton`, `Reveal`, `Icons`, `BrandIcon` / `BrandLockup`, `DsChart` (+ `chartColors.js`), and the canonical `Modal` (`.ds-modal` chrome + `useModalA11y`).

---

## 6. Design-system requirements checklist (for the rebuild)

Everything a new DS must deliver, grounded in what exists today:

| Element | Requirement |
|---|---|
| **Buttons** | 10 variants × 5 sizes + icon/block/loading states |
| **Inputs / forms** | Field, focus ring (2px green), disabled, error (`--border-danger`), validation message; RHF-compatible |
| **Cards** | One consolidated card (currently `.card` + `.ds-card`) with header/body/footer, clickable + selected states, accent variants |
| **Badges / tags** | Status colors (default/primary/success/warning/danger/info/accent/muted) + sizes |
| **Tables** | Responsive `.ds-table` with horizontal scroll wrapper; used across admin tabs |
| **Dialogs / drawers** | Single `Modal` primitive + drawer; a11y (`useModalA11y`, focus trap, escape) mandatory |
| **Toasts** | 4 semantic variants |
| **Tooltips** | 4 directions |
| **Menus / dropdowns** | `.ds-menu`, plus nav `NavDropdown` mega-menu |
| **Tabs** | `.ds-tabs` (admin console + inner pages) |
| **Accordion** | `.ds-accordion` (FAQ, etc.) |
| **Pagination** | `.ds-pagination` (admin lists) |
| **Progress** | `.ds-progress` bar + `ProgressRing` circular |
| **Charts** | `DsChart` wrapper + `chartColors.js` palette (dashboard analytics) — follow the dataviz skill for any new charts |
| **Navigation** | Public mega-menu header + authenticated collapsible sidebar + mobile bottom nav |
| **Avatars** | Initials fallback (`nameInitials`) + sizes |
| **Skeletons / empty states** | Skeleton exists; **empty-state primitive is missing** (see [13_MISSING_COMPONENTS.md](13_MISSING_COMPONENTS.md)) |
| **Brand mark** | `BrandIcon` + `BrandLockup`; duplicated in 5 places (favicon, og-cover, index.html loader, CertificateCard print) — a rebuild should centralize |
| **RTL** | Full RTL support (Arabic `dir="rtl"`) is mandatory, not optional |
| **Theming** | Light + dark at token layer, `prefers-reduced-motion` honored |
| **i18n** | All copy from 6 locale files; no inline dictionaries |

---

## 7. Known design-system debt (to resolve in redesign)

- **Four component-CSS generations** (`.btn`/global, `.card`/`.badge`, `.ds-card`/`.ds-table`, `.ds-*` design-system) — overlapping concepts (two card systems, two badge systems). Consolidate to one.
- **Two accent colors** coexist (legacy gold `#d4af37` vs current manuscript amber `#c8842a`) — pick one.
- **Backward-compat primitive tokens** still referenced by unmigrated components.
- **Modal migration** incomplete (2 documented exceptions) — [ADR 0002](../adr/0002-single-modal-component.md).

See [11_DESIGN_OPPORTUNITIES.md](11_DESIGN_OPPORTUNITIES.md) for how to approach consolidation.
