# ADR 0002 — One shared Modal component; per-PR migration of legacy dialogs

**Status:** accepted (refactoring roadmap Phase 6) · **Date:** 2026-07-14

## Context

The frontend accumulated ~12 hand-rolled dialog implementations (overlay,
escape handling, focus management, scroll lock re-implemented per file) while
a complete `.ds-modal*` CSS kit sat unconsumed in `design-system.css`. An
audit found the three component-CSS generations use **disjoint selector
namespaces** (zero collisions between `dashboard-shell.css`'s 203 `.ds-*`
selectors and `design-system.css`'s 70), so consolidation is adoption work,
not conflict resolution.

## Decision

- `components/ui/Modal.jsx` is the single dialog wrapper: `.ds-modal` chrome
  + `useModalA11y` (Escape, initial focus, scroll lock, focus restore).
  All new dialogs use it.
- Legacy dialogs migrate **one per PR**, each verified against unit/a11y
  tests and the Playwright screenshot baselines (light + dark).

## Migration state

| Dialog | State |
|---|---|
| ResourceModal | ✅ migrated (a11y test green) |
| QuickTrialModal | ✅ behavior via `useModalA11y`; **visuals stay bespoke by design** (conversion-critical marketing styling) |
| InvoiceModal | ⏸ deferred: its print stylesheet keys on `.modal__card.invoice-detail` (hifz.css `@media print`) — migrate together with a print-output check |
| CheckoutModal | queued (payment UI — migrate with extra care; covered by e2e baseline) |
| VerseCardModal, ExitIntentPopup, CancelSurvey, CommandPalette, ShareAchievement, MilestoneCelebration, StudentModal, AdminProgressModal | queued |

## Consequences

- A11y fixes land once, in one place.
- `design-system.css` gains real consumers, unblocking eventual retirement
  of the overlapping legacy `.modal*` rules in `components.css`.
- Dark-mode screenshot baselines (`e2e/dark-mode.spec.mjs`) added so the
  planned token-driven `dark.css` shrink has a regression net.
