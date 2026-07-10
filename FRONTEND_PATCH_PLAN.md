# Al-Rahma Frontend — Patch Plan & Pull Request Strategy

**Source of truth:** `FRONTEND_AUDIT.md`, `FRONTEND_VERIFICATION.md`, `FRONTEND_INDEPENDENT_REVIEW.md`.
**Author:** orchestrator (this is judgment/prioritization work, not delegated to sub-agents — same discipline as the backend engagement's patch plan).
**Severities used below reflect the Independent Review's corrections**, most notably **FE-SEC-1 downgraded from Critical to High** and FE-A11Y-6 restored to Confirmed/Medium with SC 4.1.3 attached.

---

## Phase 1 — Priority Validation

### Scoring method (9 dimensions, 1-5 each; same rubric shape as the backend engagement, "Business Impact" reframed)

| Dimension | What it measures for this frontend |
|---|---|
| Exploitability | Security-relevant findings only — how directly a defect can be triggered by an adversary |
| Security Impact | Confidentiality/integrity/availability of a security control |
| Business Impact | **Reframed for a marketing-plus-SaaS frontend**: conversion-funnel damage, SEO/accessibility legal exposure, brand trust — not payment-processor billing logic (that lives in the already-audited backend) |
| User Impact | Breadth × severity of effect on real users |
| Data Integrity | Risk of silently lost or incorrect user-submitted data |
| Likelihood | Probability of actually manifesting given real traffic patterns |
| Ease of Fixing | 5 = same-day, 1 = multi-week |
| Regression Risk | 5 = isolated change, 1 = touches shared/critical rendering paths |
| Deployment Risk | 5 = safe anytime, 1 = needs coordination |

**Composite = (Exploitability + Security + Business + User + DataIntegrity + Likelihood) + Ease − (6 − RegressionRisk) − (6 − DeploymentRisk)**, identical formula to the backend engagement.

### Scoring table (Critical/High tier)

| Finding | Exploit. | Sec. | Biz. | User | DataInt. | Likel. | Ease | RegRisk | DeployRisk | **Composite** |
|---|---|---|---|---|---|---|---|---|---|---|
| **FE-UX-1** modal CSS split (Critical) | 1 | 1 | 5 | 5 | 1 | 5 | 4 | 5 | 5 | **29** |
| **FE-SEC-2** fake success screen | 1 | 1 | 4 | 4 | 4 | 5 | 5 | 5 | 5 | **26** |
| **FE-SEC-1** homework silent discard | 1 | 1 | 3 | 4 | 5 | 5 | 3 | 4 | 4 | **23** |
| **FE-UX-QURAN-1** audio resume bug | 1 | 1 | 2 | 3 | 1 | 3 | 5 | 5 | 5 | **19** |
| **FE-UX-5** broken `/#trial` CTA | 1 | 1 | 4 | 3 | 1 | 4 | 4 | 5 | 5 | **21** |
| **FE-A11Y-3** redundant entry (3.3.7) | 1 | 1 | 3 | 3 | 2 | 5 | 3 | 4 | 4 | **19** |
| **FE-A11Y-1** LangSwitcher keyboard (4.1.2) | 1 | 1 | 3 | 3 | 1 | 3 | 2 | 3 | 4 | **14** |
| **FE-PERF-1** DsChart 400KB chunk | 1 | 1 | 2 | 3 | 1 | 5 | 2 | 3 | 4 | **15** |
| **FE-PERF-3** i18n eager bundle | 1 | 1 | 3 | 3 | 1 | 5 | 3 | 3 | 4 | **17** |
| **FE-ARCH-3** Quran God component | 1 | 1 | 2 | 3 | 2 | 3 | 1 | 1 | 2 | **9** |
| **FE-TEST-1/2** coverage ~2-3%, no E2E | 1 | 1 | 2 | 2 | 2 | 3 | 2 | 5 | 5 | **16** |

### Final implementation priority (Critical/High tier)

1. **FE-UX-1** (29) — modal CSS split across 3 routes
2. **FE-SEC-2** (26) — fake enrollment-success screen
3. **FE-SEC-1** (23) — homework silent file discard
4. **FE-UX-5** (21) — broken `/#trial` CTA
5. **FE-UX-QURAN-1** (19) — audio resume-after-stop, **and** **FE-A11Y-3** (19) — redundant entry (tie)
6. **FE-PERF-3** (17) — i18n eager bundle
7. **FE-TEST-1/2** (16) — coverage/E2E gap
8. **FE-PERF-1** (15) — DsChart chunk
9. **FE-A11Y-1** (14) — LangSwitcher keyboard
10. **FE-ARCH-3** (9) — Quran God component (correctly last among this tier: high impact but genuinely hard/risky to fix safely, exactly the profile the composite formula is designed to sequence later, not first)

**Where this disagrees with the raw severity labels alone:** `FE-ARCH-3` (the Quran God component) is labeled High severity in the audit but scores lowest in this tier's composite, because it is expensive and risky to fix safely (Ease=1, RegressionRisk=1) despite being genuinely important. This does not mean it should be dropped — it means it should be scheduled as a deliberate, separately-resourced refactor project (see Phase 3), not squeezed into the same release as the cheap, high-composite fixes above it. `FE-TEST-1/2` similarly scores lower than its "High" label alone would suggest, because closing a test-coverage gap is inherently slower work with no single quick win — it is scheduled as ongoing parallel work, identical to the backend engagement's treatment of its equivalent finding.

---

## Phase 2 — Patch Design

### 1. FE-UX-1 — Modal CSS code-split breaks CheckoutModal/InvoiceModal/AdminProgressModal

**Problem:** `.modal`, `.modal__card`, `.modal__close`, `.checkout__*`, and `.inv__*` exist only in `src/styles/hifz.css`, which is code-split and loaded only by `Quran.jsx`/`HifzReviewPage.jsx`. `CheckoutModal` (Enroll, Pricing), `InvoiceModal` (Billing), and `AdminProgressModal` (Admin) reference these classes with no fallback, rendering completely unstyled on a cold visit to those routes.

**Root Cause:** these shared modal/checkout/invoice styles were originally authored alongside the Hifz feature (likely because that's where a `.modal` pattern was first needed) and never extracted when reused by unrelated features later — a classic "styles followed the first consumer, not the concept" mistake, compounded by the fact that Vite's CSS code-splitting genuinely does hide the bug in any session that also touches Quran/Hifz.

**Affected Files:** `src/styles/hifz.css` (source of the rules), `src/components/ui/CheckoutModal.jsx`, `src/components/ui/InvoiceModal.jsx`, `src/components/features/admin/AdminProgressModal.jsx`, `src/pages/Enroll.jsx`, `src/components/Pricing.jsx`, `src/pages/Billing.jsx`, `src/pages/AdminDashboard.jsx`.

**Affected Components:** `CheckoutModal`, `InvoiceModal`, `AdminProgressModal`, and — indirectly — every page that mounts them.

**Alternative Solutions:**
- **A. Move the shared rule blocks into a new, globally-loaded stylesheet** (added to `styles.css`'s import index). *Pros:* simplest possible diff; one file to review. *Cons:* per the Independent Review, this grows the global CSS bundle for every page including ones that never show a modal (legal pages, blog posts) — a regression against the project's own established per-page CSS-splitting discipline.
- **B. Give each of the three components its own small, directly-imported CSS file** (e.g. `checkoutModal.css`, `invoiceModal.css`, `adminProgressModal.css`), co-located with the component. *Pros:* keeps styling scoped to the component that needs it, matching the existing project convention (page-specific CSS imported directly by the owning page); no global bundle growth; each file can be reviewed independently. *Cons:* three small new files instead of one; a shared `.modal`/`.modal__card` base would need to be duplicated or factored into a fourth tiny shared file imported by all three.
- **C. Extract only the truly-shared shell classes (`.modal`, `.modal__card`, `.modal__close`, `.modal__title`) into one small globally-loaded `modal-shell.css`, and keep `.checkout__*`/`.inv__*` (the genuinely component-specific classes) in per-component files.** *Pros:* the shell classes are small, universally needed by any future modal, and cheap to load globally; the larger component-specific rule sets stay scoped. *Cons:* slightly more files to set up initially.

**Preferred Solution: C.** This is the design explicitly endorsed by the Independent Review (Phase 3, Blind spot 2) as the option that fixes the bug without reintroducing the code-splitting discipline it violates. The modal shell (`.modal`/`.modal__card`/`.modal__close`/`.modal__title`) is small, generic, and genuinely reusable by any future modal in the app — a fine candidate for the global index. `.checkout__*` and `.inv__*` are large, feature-specific rule sets that belong with their components.

**Regression Risk:** Low-Medium. The change is additive (new CSS, updated imports) rather than a rewrite of any component logic. The main risk is visual: confirm the modal shell classes don't collide with or override anything already in the global CSS cascade (check `components.css` for any same-named class before adding the new file to the index).

**Rollback Plan:** revert the new CSS file(s) and the import-index/component-import changes; the three modals return to their current (broken-on-cold-load) behavior — no worse than today, no data or state impact.

**Testing Strategy:** manual visual verification on a genuinely cold session (clear cache, or a fresh incognito window) hitting `/enroll`, `/billing`, and `/admin` directly — not via a session that visited Quran first, which is exactly the trap that hid this bug originally. Confirm the overlay/backdrop/centered-card/44×44 close button all render correctly on each route in isolation.

**Success Criteria:** all three modals render with correct overlay, positioning, and a properly-sized close button on a cold, never-visited-Quran-first session, on both `Enroll`/`Pricing`/`Billing`/`Admin` routes.

---

### 2. FE-SEC-2 — Abandoned checkout shows fake enrollment-success screen

**Problem:** `Enroll.jsx`'s `handleCheckoutClose` unconditionally sets `done = true`, showing the confetti success screen regardless of whether payment occurred.

**Root Cause:** the gateway (card/PayPal) success path never calls `onClose` at all (it navigates away via `window.location.href`), so `onClose` was implicitly assumed to only ever fire on a genuine completion — but it also fires on ×/Escape/backdrop-dismiss, which the original implementation didn't account for.

**Affected Files:** `src/pages/Enroll.jsx`, `src/components/ui/CheckoutModal.jsx`.

**Affected Components:** `Enroll`, `CheckoutModal`.

**Alternative Solutions:**
- **A. Have `CheckoutModal` distinguish "completed" from "dismissed" by calling two different callback props** (`onComplete` for genuine success, `onClose` for dismissal only), and have `Enroll.jsx` only set `done=true` from `onComplete`. *Pros:* explicit, self-documenting, matches the Independent Review's finding that the gateway path never calls the existing `onClose` anyway — so this is a low-risk rename/split, not new logic. *Cons:* requires updating every call site that currently passes `onClose`.
- **B. Have `handleCheckoutClose` simply stop calling `setDone(true)`** and leave the user on the Enroll page with the modal closed, showing no special state. *Pros:* smallest possible diff — a one-line deletion. *Cons:* a user who successfully completes manual/offline payment (if any such path exists elsewhere and also routes through this same close handler) could lose their success confirmation; needs confirming no completion path currently relies on this specific handler for its success state.

**Preferred Solution: A.** It is explicit about intent, costs little given the Independent Review already established the gateway path never touches this callback (so there is no existing "success via onClose" behavior to preserve), and prevents this exact bug class from recurring if a future payment method is added.

**Regression Risk:** Low. Confirmed by the Independent Review that the real success path (gateway redirect) is entirely unaffected by this change, since it never calls `onClose` today.

**Rollback Plan:** revert the prop rename/split; `handleCheckoutClose` returns to setting `done=true` unconditionally (the current, buggy-but-familiar behavior).

**Testing Strategy:** manually open checkout and dismiss it via each of the three paths (×, Escape, backdrop click) — confirm the user remains on the Enroll form, not the success screen, for all three. Separately confirm the gateway redirect path (which can be tested against Stripe/PayPal test-mode credentials) still reaches the real success state via its own navigation, unaffected.

**Success Criteria:** abandoning checkout via any dismissal method never shows the success screen; completing payment via the gateway redirect still works exactly as today.

---

### 3. FE-SEC-1 — HomeworkPage silent file discard (severity: High, corrected from Critical)

**Problem:** the staged `File` object is dropped before any network request; the submission is sent as `{notes}` JSON only; all three mutations on the page swallow every error.

**Root Cause:** this page is confirmed demo/scaffold code (`catch { /* demo noop */ }` comments, hardcoded fallback data) — it was very likely built as a UI mockup ahead of the real backend upload endpoint being ready, and the mock never got wired up to a real implementation before shipping.

**Affected Files:** `src/pages/HomeworkPage.jsx`.

**Affected Components:** `HomeworkPage`, its internal `SubmitModal`.

**Alternative Solutions:**
- **A. Implement the real upload** using `FormData` and a genuine multipart POST, coordinated with whatever the backend's actual homework-submission endpoint expects (this requires backend coordination — confirm the endpoint contract exists and accepts multipart uploads; if it doesn't yet, this blocks on backend work not covered by this frontend-only engagement). Add client-side size/type validation on the `<input>` before staging. Remove the `catch { /* demo noop */ }` swallowing so genuine errors surface to the student.
- **B. If the upload endpoint genuinely does not exist yet on the backend, ship an honest interim state**: remove the file-attachment UI entirely (or clearly label it "coming soon" / disable it) so students aren't misled into believing an attachment was sent, while keeping the notes-only submission (which does appear to reach a real endpoint) functional and error-transparent.

**Preferred Solution: depends on a fact this engagement cannot resolve alone — whether the backend's homework-submission endpoint currently accepts file uploads.** If yes: **A**, fully wire the real upload. If no: **B** is the responsible interim step, since shipping a feature that silently fails is worse than shipping no feature and being honest about it. **This is flagged as a required pre-implementation check, not a decision this document can make unilaterally** — the Execution Spec (final document) will require this confirmation before Implementation Order proceeds on this item.

**Regression Risk:** Medium for Option A (touches a real network call and a currently-mocked endpoint interaction) — Low for Option B (removing/disabling UI, no new network logic). Either way, removing the blanket `catch { /* demo noop */ }` on all three mutations is required regardless of which option is chosen, and that change alone is Low risk (it only makes existing failures visible, it doesn't change success-path behavior).

**Rollback Plan:** Option A — revert to the JSON-only POST if the real upload integration causes issues, accepting the silent-discard behavior returns temporarily while a fix is re-attempted; Option B — re-enable the attachment UI if a decision is made to keep it as a visible "not yet implemented" affordance instead of hiding it.

**Testing Strategy:** for Option A, an integration test asserting a real `FormData` request is sent with the file attached, and that a simulated server error surfaces a visible error message to the student (not a silent success). For Option B, a manual check that the interim messaging is clear and that the notes-only submission's error path is now visible.

**Success Criteria:** a student attempting to submit homework with an attachment either successfully uploads it (Option A) or is never given the impression an attachment was accepted when it wasn't (Option B) — and in both cases, a genuine submission failure produces a visible error, not a silent fake success.

---

### 4. FE-UX-5 — Broken `/#trial` cross-page CTA links

**Problem:** `FAQ.jsx` and `BlogPost.jsx` link to `/#trial`, but no hash-scroll handler exists anywhere in the codebase, `ScrollToTop.jsx` force-scrolls to top on every route change, and the target section is wrapped in `DeferredSection` (not mounted at load) on Home.

**Root Cause:** the trial section's lazy-mount-on-scroll optimization (`DeferredSection`, built to fix a real 1.5s main-thread-blocking issue per the project's own documented history) was added after these cross-page hash links were already in place, and nobody re-tested the cross-page link path against the new deferred-mount behavior.

**Affected Files:** `src/pages/FAQ.jsx`, `src/pages/BlogPost.jsx`, `src/components/ui/ScrollToTop.jsx`, `src/pages/Home.jsx` (context only), `src/components/Trial.jsx` (context only).

**Affected Components:** `FAQ`, `BlogPost`, `ScrollToTop`.

**Alternative Solutions:**
- **A. Add a hash-scroll effect to `ScrollToTop.jsx`** that checks `location.hash` and, if present, scrolls to the matching element instead of the top — but this alone doesn't solve the `DeferredSection`-not-mounted problem, since the target element won't exist yet when the effect runs.
- **B. Replace the `/#trial` links with a navigation that opens the same trial flow via `TrialContext` directly** (the mechanism `Home.jsx`'s own in-page buttons already use), routing to Home with a query parameter or state flag that `Home.jsx` checks on mount to force-render and scroll to the trial section immediately, bypassing the deferred-mount optimization specifically for this entry path.
- **C. Replace the cross-page CTA target entirely** — point FAQ/BlogPost's "Book a Free Trial" buttons at `/enroll` instead of `/#trial`, since `Enroll.jsx` is a fully-functional, always-mounted page that accomplishes the same conversion goal without depending on Home's deferred-section behavior at all.

**Preferred Solution: C.** It sidesteps the entire class of problem (hash-scrolling into a conditionally-mounted section) rather than patching around it, requires no changes to `DeferredSection`'s legitimate performance optimization, and `/enroll` is arguably a more direct conversion path than a trial-request form embedded mid-page on Home. **Alternative B is a reasonable second choice** if product/design specifically wants the trial-request form's shorter flow rather than the fuller Enroll page — that's a product decision this document flags rather than makes.

**Regression Risk:** Low. This is a link-target change in two files, not a change to `DeferredSection`, `ScrollToTop`, or Home's rendering behavior.

**Rollback Plan:** revert the two link targets back to `/#trial`.

**Testing Strategy:** manual click-through from FAQ and a blog post, confirm the CTA lands on a working, immediately-visible conversion surface.

**Success Criteria:** clicking "Book a Free Trial" from FAQ or any blog post reaches a functional conversion form immediately, with no dead scroll-to-nowhere behavior.

---

### 5a. FE-UX-QURAN-1 / FE-ARCH-4 — Audio resumes after explicit Stop/Pause

**Problem:** `setTimeout` chains scheduled by `advance()` in `useQuranAudioEngine.js` are never cleared by `pause()`/`stop()`, so audio genuinely resumes on the next verse if the user acts within the ~400ms inter-verse gap.

**Root Cause:** the timeout IDs were never captured in a ref for later cancellation — an omission, not a deliberate design choice (no comment or rationale in the code suggests this was intentional).

**Affected Files:** `src/hooks/useQuranAudioEngine.js`.

**Affected Components:** `useQuranAudioEngine` (consumed by `QuranSyncPlayer.jsx` and others).

**Alternative Solutions:**
- **A. Store each scheduled timeout's ID in a ref** (e.g., `pendingTimeoutRef`), and have both `pause()` and `stop()` call `clearTimeout` on it before doing their existing work. *Pros:* minimal, surgical, directly targets the exact mechanism causing the bug. *Cons:* none significant — this is the textbook fix for this exact bug class.
- **B. Refactor the entire timeout-based advance logic to use a cancellable async/await pattern instead of raw `setTimeout`.** *Pros:* more robust long-term. *Cons:* a much larger change to a 287-line hook already flagged as doing too much (FE-ARCH-4) — disproportionate for fixing this one bug, and exactly the kind of "bundle a small fix into a big refactor" mistake the Independent Review specifically warned against.

**Preferred Solution: A.** Small, targeted, independently shippable — exactly as the Independent Review required (Phase 1, sequencing correction).

**Regression Risk:** Low. Adding a ref and two `clearTimeout` calls does not change any other behavior of the hook.

**Rollback Plan:** revert the ref addition and the two `clearTimeout` calls.

**Testing Strategy:** a component test driving the sync player through play → (wait for a verse to end, entering the inter-verse gap) → stop, asserting the audio element's `paused` state remains true and no further `playIndex` call occurs after the gap window elapses.

**Success Criteria:** pressing Stop or Pause at any point, including during the inter-verse gap, reliably halts playback with no resumption.

---

### 5b. FE-A11Y-3 / FE-UX-2 — Enroll→Checkout redundant entry (SC 3.3.7)

**Problem:** name/email/whatsapp collected in Enroll Step 1 are not passed to `CheckoutModal`, which re-asks for name/email/phone; logged-in users also re-enter data the app already has.

**Root Cause:** `CheckoutModal` was very likely built as a standalone, reusable component (it's also mounted from `Pricing.jsx`, a context where no prior customer data exists) and never given an optional pre-fill prop for the case where calling code already has the customer's details.

**Affected Files:** `src/pages/Enroll.jsx`, `src/components/ui/CheckoutModal.jsx`.

**Affected Components:** `Enroll`, `CheckoutModal`.

**Alternative Solutions:**
- **A. Add an optional `initialCustomer` prop to `CheckoutModal`**, defaulting to the current empty state when not provided (preserving `Pricing.jsx`'s existing no-prefill usage), and have `Enroll.jsx` pass its Step 1 data through. Additionally, have `Enroll.jsx` pre-fill Step 1 itself from `useAuth()`'s `user` object when the visitor is logged in.
- **B. Lift the customer-data state out of both components entirely into `TrialContext` or a new shared context.** *Pros:* a single source of truth. *Cons:* disproportionate for what is fundamentally a one-time prop-passing fix; over-engineering for the scope of the actual defect.

**Preferred Solution: A.** Minimal, backward-compatible (the `Pricing.jsx` call site needs no changes since the new prop is optional), and directly closes both halves of the finding (the Enroll→Checkout gap and the logged-in-user gap).

**Regression Risk:** Low. Additive prop with a safe default; `Pricing.jsx`'s existing behavior is unaffected.

**Rollback Plan:** revert the new prop and the `Enroll.jsx`/`useAuth` pre-fill logic.

**Testing Strategy:** manual walkthrough of Enroll as both a logged-in and a logged-out user, confirming Step 1 pre-fills correctly for logged-in users and that Step 4's checkout modal shows the Step-1-entered data rather than blank fields.

**Success Criteria:** no user is asked to type the same name/email twice within one Enroll session; logged-in users see their known data pre-filled from the start.

---

### 6. FE-PERF-3 — i18n eager bundle (327 kB in the main chunk)

**Problem:** all 6 language dictionaries are statically imported into `src/i18n/index.js`, landing in the main entry chunk downloaded by every user regardless of selected language.

**Root Cause:** straightforward eager-import convenience at initial build-out, never revisited as the dictionaries grew.

**Affected Files:** `src/i18n/index.js`, `src/context/LangContext.jsx` (consumer of the language switch).

**Affected Components:** the entire app (global i18n layer).

**Alternative Solutions:**
- **A. Convert to `import()`-based dynamic loading**, keyed off the active language, with a loading state while the new dictionary fetches on language switch. *Pros:* directly solves the bundle-weight problem; only the active language (plus English as a safe default/fallback) ships in the initial load. *Cons:* introduces a brief loading flicker on language switch that doesn't exist today; requires careful handling of the "first paint before any language is chosen" case (likely: eagerly bundle the default/English dictionary only, lazy-load the other 5).
- **B. Leave English eager (since it's the default) and lazy-load only the other 5.** This is a refinement of A, not a separate alternative — call out explicitly since "lazy-load all 6 including English" would regress first-load performance for the majority-language default case.

**Preferred Solution: A, implemented as B's refinement** (eager English, lazy the other 5). This is the audit's original recommendation and survives the Independent Review unchanged.

**Regression Risk:** Medium. Touches the core i18n loading mechanism used by every page; requires careful handling of the loading-state UX during a language switch, and thorough testing across all 6 languages to confirm none regress.

**Rollback Plan:** revert to static imports for all 6 languages.

**Testing Strategy:** verify each of the 6 languages still loads and renders correctly after switching; measure the real main-chunk size reduction via a fresh `npm run build` before/after; confirm no flash-of-untranslated-content or broken state during the lazy-load window.

**Success Criteria:** main entry chunk shrinks by approximately the weight of 5 language dictionaries (~270 kB raw, based on the verified per-language sizes); switching language still works correctly for all 6 options.

---

### 7. FE-TEST-1/2 — Test coverage (~2-3% real, no E2E)

**Problem:** true whole-codebase coverage is roughly 2-3%; zero coverage on all pages, forms, dashboards, and the API layer; no E2E testing exists.

**Root Cause:** testing effort was concentrated on the highest-perceived-risk areas first (billing, a security regression, accessibility-flavored modals) — a reasonable initial sequencing, never circled back to for the rest of the app.

**Affected Files:** the entire `src/pages/`, `src/api/` trees (no test files exist for any of them).

**Alternative Solutions:**
- **A. Prioritize new tests for the highest-risk untested surfaces first**: the auth forms (Login/Register/ForgotPassword/ResetPassword), the Enroll/Checkout flow (directly relevant given FE-UX-1/FE-SEC-2/FE-A11Y-3 all live here), and HomeworkPage (directly relevant given FE-SEC-1) — rather than a uniform sweep across all 48 pages.
- **B. Add a minimal E2E smoke suite** (Playwright, given it's the more actively-maintained option per current tooling trends) covering the single most business-critical path: register/login → enroll → complete a test-mode payment → land on a working dashboard. This is a new dependency addition, explicitly flagged as such (unlike every other recommendation in this plan, which uses only already-installed tooling).

**Preferred Solution: both A and B, sequenced as ongoing/parallel work, not a release gate** — identical framing to the backend engagement's equivalent finding. Gating every other fix in this plan on reaching a specific coverage percentage would be disproportionate; instead, each of the specific bug-fix PRs above (FE-UX-1, FE-SEC-1, FE-SEC-2, FE-A11Y-3) should include a regression test for that specific fix as part of its own PR, and broader coverage expansion proceeds as separate, ongoing PRs.

**Regression Risk:** None (test-only additions cannot regress production behavior; they can only reveal pre-existing bugs, which is a good outcome).

**Rollback Plan:** N/A — removing a test only removes coverage, never affects production code.

**Testing Strategy:** this finding's fix *is* the testing strategy for the rest of the plan.

**Success Criteria:** each of the Critical/High bug-fix PRs above ships with its own regression test; a minimal E2E smoke path exists covering register→enroll→pay→dashboard within a defined timeframe (see Execution Spec).

---

### 8. FE-PERF-1 — DsChart 400KB chunk

**Problem:** `DsChart.jsx` barrel-imports 15 recharts exports (including a confirmed-dead `ReferenceLine`), making it the single largest chunk in the build.

**Root Cause:** convenience barrel-import at build-out time, never revisited as recharts' footprint became the dominant bundle cost.

**Affected Files:** `src/components/ui/DsChart.jsx`.

**Alternative Solutions:**
- **A. Remove the dead `ReferenceLine` import** — free, zero-risk, but per the audit's own honest framing, likely negligible size impact given recharts' internal coupling.
- **B. Split `DsChart.jsx` into per-chart-type modules** (`DsBarChart.jsx`, `DsAreaChart.jsx`, etc.), each importing only its own recharts pieces — **contingent on verifying recharts v3 actually tree-shakes per-chart-type** (the Independent Review's Blind spot 1 — this must be confirmed with a real minimal-build experiment before committing to this as the fix, since if recharts doesn't tree-shake this way, the split produces zero benefit for real engineering cost).
- **C. Replace recharts with a materially lighter charting approach** for these specific bar/area visualizations (hand-rolled SVG, or a sub-30kB library) given the actual chart complexity in use is low (simple monthly bars/area trends).

**Preferred Solution: A immediately (free), then a real tree-shaking experiment to decide between B and C** — do not commit to B's PR scope until the experiment confirms it would actually reduce shipped bytes; if the experiment shows recharts doesn't tree-shake usefully, go straight to C.

**Regression Risk:** Low for A. Medium for B/C (touches a shared, multi-page-consumed component — requires visual regression checking across Admin/Dashboard/TeacherDashboard).

**Rollback Plan:** revert the import change (A) or the module split/library swap (B/C).

**Testing Strategy:** real `npm run build` before/after with byte-level chunk-size comparison (not an estimate); visual confirmation that all three chart-consuming dashboards render identically.

**Success Criteria:** a measurable, real reduction in the largest chunk's shipped size, confirmed via actual build output, not an assumption.

---

### 9. FE-A11Y-1 — LangSwitcher keyboard accessibility (SC 4.1.2)

**Problem:** `role="listbox"`/`role="option"` with zero keyboard handling.

**Root Cause:** the component was likely built mouse-first and the ARIA roles added later for semantic correctness without the corresponding interaction model.

**Affected Files:** `src/components/ui/LangSwitcher.jsx`.

**Alternative Solutions:**
- **A. Implement the full ARIA Authoring Practices Guide listbox pattern**: arrow-key roving `tabIndex`, Home/End, Escape-to-close, type-ahead. *Pros:* fully correct. *Cons:* the most implementation effort of the options.
- **B. Simplify to a native `<select>` element styled to match the current visual design**, which gets full keyboard/screen-reader support for free from the browser. *Pros:* eliminates the entire class of custom-ARIA-widget bugs at the source; far less code to maintain. *Cons:* native `<select>` styling is more constrained (can't fully replicate custom dropdown visuals like flag icons inline); would need a design review to confirm the visual result is acceptable.

**Preferred Solution: B, if design accepts the visual constraints; otherwise A.** This is a genuine product/design decision this document flags rather than resolves unilaterally — native `<select>` is the objectively lower-maintenance, more-robust choice from an engineering and accessibility standpoint, but the final call depends on whether the current custom flag+label visual design is a hard requirement.

**Regression Risk:** Low-Medium depending on option chosen; must preserve the existing mouse-based interaction (Independent Review Blind spot 3) regardless of which option is implemented.

**Rollback Plan:** revert to the current (mouse-only-functional) component.

**Testing Strategy:** manual test pass covering mouse-only, keyboard-only, and mixed interaction (per Independent Review requirement) — not just an automated keyboard-only test.

**Success Criteria:** the language switcher is fully operable via keyboard alone (arrow keys, Enter, Escape) with no regression to existing mouse-based interaction.

---

### 10-28. Remaining Medium/Low findings (condensed)

| Finding | Preferred Solution | Regression Risk | Effort |
|---|---|---|---|
| FE-ARCH-1 (single ErrorBoundary/Suspense) | Add per-zone boundaries (marketing/authenticated/Quran) wrapping their route groups in `App.jsx` | Low | Small |
| FE-ARCH-2 (unmemoized contexts) | `useMemo`/`useCallback` all 3 remaining providers (matching `LangContext`'s existing pattern); note per Independent Review this doesn't fully solve within-context over-subscription — flag context-splitting as a future follow-up only if a specific expensive consumer is found affected | Low | Small |
| FE-ARCH-5 (raw useEffect fetches bypass Query) | Leave third-party-API pages as-is (defensible given they don't hit the app backend); no aggregate-count claim to act on per the verification correction | N/A | N/A |
| FE-PERF-2 (legacy bundle +44%) | Product/business decision on real device-support requirements before any technical change — flag for stakeholder input, not an engineering-only fix | N/A (business decision) | N/A |
| FE-PERF-4 (zero React.memo) | Audit the highest-render-cost list components (Quran verse list, admin tables) specifically for `memo()` candidacy rather than blanket application | Low | Small-Medium |
| FE-A11Y-2 (no modal focus-trap) | Add Tab-cycling to `useModalA11y.js` (query focusable descendants, wrap Tab/Shift+Tab at the boundaries) — fixes all 5 consuming modals at once | Low-Medium | Small |
| FE-A11Y-4 (gold contrast, corrected ratios) | Darken `--text-accent-dark` to a value passing 4.5:1 on its actual usage backgrounds (recompute per the verified real background colors, not assumed white/cream); restrict `--text-accent` to decorative/large-text/non-text usage only | Low | Small |
| FE-A11Y-5 (inconsistent `lang="ar"`) | Sweep all confirmed-missing instances (file list in Verification doc) adding `lang="ar"` alongside existing `dir="rtl"` | Low | Small |
| FE-A11Y-6 (no aria-live, now SC 4.1.3) | Add `role="status"`/`aria-live="polite"` to Tasbeeh/Adhkar counters, announcing count changes and target-reached | Low | Small |
| FE-SEC-3 (http.js no interceptor/timeout/retry) | Add a response interceptor for global 401 handling + a sane request timeout (e.g. 15s) | Low-Medium | Small |
| FE-SEC-4 (CSRF token truncation) | Fix `.split('=')[1]` to `.slice(indexOf('=')+1)` | Low | Trivial |
| FE-SEC-5 (sanitizer weaker than DOMPurify) | Migrate to DOMPurify — empirically confirmed low current risk (Independent Review Phase 2) but still the more robust long-term choice given the structural weakness is real | Low | Small |
| FE-SEC-6 (CSP missing Clarity/Tawk.to) | Add `www.clarity.ms`/`embed.tawk.to` (+ their subdomains) to `script-src`/`connect-src` in `vercel.json` | Low | Trivial |
| FE-TEST-3 (dashboard-shell.css stray brace) | Delete the stray `}` | None | Trivial |
| FE-TEST-4 (Prettier unenforced) | Run `npm run format` once (250 files), add `format:check` to `ci.yml` | Medium (large diff, one-time) | Medium |
| FE-TEST-5 (Node version drift) | Add `"engines": {"node": ">=20 <21"}` to `package.json`, add a matching `.nvmrc` | None | Trivial |
| FE-UX-6 (CoursesHub duplicate route) | Fix the Hifz card's route to its correct distinct destination | Low | Trivial |
| FE-UX-7 (CoursesQuran/Arabic missing CSS) | Author the missing `.hub-hero__actions`/`.hub-feature-row`/`.hub-cta-box`/`.hub-card__points`/`.hub-card--detailed` rules | Low | Small |
| FE-UX-8 (FAQ RTL selector mismatch) | Fix `rtl.css`'s selector to match the real class `.faq-item__q` | None | Trivial |
| FE-UX-DASH-1 (AdminUsersTab no pagination) | Add real pagination controls wired to `usersTotal`/page params | Low-Medium | Medium |
| FE-UX-DASH-2 (no lang switcher in dashboard) | Add `LangSwitcher` to `DashboardLayout`'s header (inherits the FE-A11Y-1 fix automatically once that ships) | Low | Small |
| FE-UX-9 (ResetPassword wrong copy) | Add a dedicated "invalid or missing reset link" string, stop reusing `rp.noMatch` | None | Trivial |
| FE-UX-10 (Enroll payment button no double-submit guard) | Add the same `disabled={loading}` pattern already used on the earlier steps' Continue button | Low | Trivial |
| FE-UX-11 (missing trust signals at payment step) | Product/design decision — surface the guarantee/security copy already written for the Pricing page onto the Enroll Step 4 summary | N/A (product decision) | Small |
| `react-hook-form` phantom dependency | Remove from `package.json` (confirmed zero usages) — or, if forms are ever revisited, actually adopt it rather than continue hand-rolling | None | Trivial |
| `VITE_DAILY_DOMAIN` dead config | Remove from `.env.example` | None | Trivial |
| ESLint `no-unused-vars` PascalCase gap | Change `varsIgnorePattern` to exclude component-like names from the exemption, or remove the pattern entirely | Low (may surface previously-hidden warnings) | Small |
| `seoRoutes` drift (32 vs 65 routes) | Add the 2 confirmed-missing tool routes; consider deriving `seoRoutes` from `App.jsx`'s route table programmatically to prevent future drift | Low | Small-Medium |

---

## Phase 3 — Pull Request Strategy

Each PR is single-purpose. No PR mixes unrelated fixes.

| # | Title | Scope | Files | Risk | Est. LOC | Testing | Rollback | Merge Order |
|---|---|---|---|---|---|---|---|---|
| PR-1 | `fix(checkout): scope modal/checkout/invoice CSS to owning components` | FE-UX-1 | new `modal-shell.css` + `checkout.css`/`invoice.css`/`admin-progress.css`, `styles.css`, 3 component files | Low-Med | ~120 | Cold-session manual visual check on all 3 routes | Revert new CSS + import changes | **1** |
| PR-2 | `fix(enroll): distinguish checkout dismissal from completion` | FE-SEC-2 | `Enroll.jsx`, `CheckoutModal.jsx` | Low | ~20 | Manual dismiss-via-3-paths + gateway-redirect check | Revert prop split | 2 |
| PR-3 | `fix(homework): stop silently discarding submitted files` | FE-SEC-1 | `HomeworkPage.jsx` | Low-Med (depends on backend confirmation) | ~40-100 | Integration test on FormData/error-surfacing | Revert to JSON-only + noop catches | 3 |
| PR-4 | `fix(cta): point FAQ/BlogPost trial CTAs at a working destination` | FE-UX-5 | `FAQ.jsx`, `BlogPost.jsx` | Low | ~4 | Manual click-through | Revert link targets | 4 |
| PR-5 | `fix(quran): cancel pending audio timeouts on pause/stop` | FE-UX-QURAN-1/FE-ARCH-4 | `useQuranAudioEngine.js` | Low | ~15 | Component test: stop during inter-verse gap | Revert ref + clearTimeout additions | 5 |
| PR-6 | `fix(enroll): pass Step-1 customer data into checkout, prefill for logged-in users` | FE-A11Y-3/FE-UX-2 | `Enroll.jsx`, `CheckoutModal.jsx` | Low | ~30 | Manual logged-in/out walkthrough | Revert new prop + prefill logic | 6 |
| PR-7 | `perf(i18n): lazy-load non-default language dictionaries` | FE-PERF-3 | `i18n/index.js`, `LangContext.jsx` | Medium | ~50 | All 6 languages manually re-verified; before/after build size | Revert to static imports | 7 |
| PR-8 | `chore(charts): remove dead ReferenceLine import` | FE-PERF-1 (part A) | `DsChart.jsx` | None | ~1 | Build + visual check | Revert | 8 |
| PR-9 | `spike: verify recharts v3 per-chart tree-shaking` | FE-PERF-1 (investigation, no production change) | scratch/experimental build only | None | 0 (throwaway) | Real build-size comparison | N/A — not merged, informs PR-10's scope | 9 |
| PR-10 | `perf(charts): split DsChart into per-type modules` OR `replace recharts` (scope decided by PR-9's result) | FE-PERF-1 (part B/C) | `DsChart.jsx` and consumers | Medium | ~100-300 (depends on chosen path) | Visual regression on Admin/Dashboard/TeacherDashboard + real build size | Revert to monolithic `DsChart.jsx` | 10 |
| PR-11 | `fix(a11y): implement full keyboard support for LangSwitcher` (or native-select swap, pending design input) | FE-A11Y-1 | `LangSwitcher.jsx` | Low-Med | ~40-80 | Manual mouse+keyboard+mixed test pass | Revert component | 11 |
| PR-12 | `fix(a11y): add Tab focus-trap to useModalA11y` | FE-A11Y-2 | `useModalA11y.js` | Low-Med | ~25 | Manual Tab-cycling check on all 5 consuming modals | Revert hook change | 12 |
| PR-13 | `fix(a11y): correct gold-accent text contrast` | FE-A11Y-4 | `tokens.css`, any component relying on the old value for text | Low | ~10 | Recompute contrast on real usage backgrounds | Revert token value | 13 |
| PR-14 | `fix(a11y): add missing lang="ar" attributes` | FE-A11Y-5 | ~10 files per the Verification doc's list | None | ~20 | Manual screen-reader spot check | Revert per file | 14 |
| PR-15 | `fix(a11y): add aria-live to Tasbeeh/Adhkar counters` | FE-A11Y-6 | `Tasbeeh.jsx`, `Adhkar.jsx` | None | ~10 | Screen-reader manual check | Revert | 15 |
| PR-16 | `fix(security): add response interceptor + timeout to http.js` | FE-SEC-3 | `http.js` | Low-Med | ~30 | Manual 401 simulation, hung-request timeout check | Revert | 16 |
| PR-17 | `fix(security): correct CSRF cookie-value truncation` | FE-SEC-4 | `http.js` | None | ~2 | Unit test with a `=`-containing token | Revert | 17 |
| PR-18 | `chore(security): migrate tafsir sanitizer to DOMPurify` | FE-SEC-5 | `TafsirPanel.jsx`, `package.json` (new dependency) | Low | ~20 + dep | Re-run the 7-payload probe against the new implementation | Revert to hand-rolled sanitizer | 18 |
| PR-19 | `fix(security): add Clarity/Tawk.to hosts to CSP` | FE-SEC-6 | `vercel.json` | None | ~4 | Manual check both widgets load under the updated CSP | Revert | 19 |
| PR-20 | `fix(css): remove stray brace in dashboard-shell.css` | FE-TEST-3 | `dashboard-shell.css` | None | ~1 | `format:check` passes | Revert | 20 |
| PR-21 | `chore(format): run Prettier across the codebase + enforce in CI` | FE-TEST-4 | 250 files + `ci.yml` | Medium (large diff, mechanical) | ~250 files touched, few lines each | `format:check` passes in CI | Revert the formatting commit (single atomic commit recommended) | 21 |
| PR-22 | `chore(tooling): pin Node version` | FE-TEST-5 | `package.json`, new `.nvmrc` | None | ~3 | CI still passes | Revert | 22 |
| PR-23 | `fix(routing): correct CoursesHub duplicate Hifz route` | FE-UX-6 | `CoursesHub.jsx` | None | ~1 | Manual click-through | Revert | 23 |
| PR-24 | `fix(css): author missing CoursesQuran/CoursesArabic classes` | FE-UX-7 | new CSS rules, likely in `course-pages.css` | Low | ~60 | Visual check both pages | Revert | 24 |
| PR-25 | `fix(rtl): correct FAQ RTL selector mismatch` | FE-UX-8 | `rtl.css` | None | ~1 | Visual check FAQ in Arabic | Revert | 25 |
| PR-26 | `feat(admin): add pagination to AdminUsersTab` | FE-UX-DASH-1 | `AdminUsersTab.jsx`, related admin API hook | Low-Med | ~60 | Manual check with a seeded large user list | Revert | 26 |
| PR-27 | `feat(dashboard): add language switcher to dashboard shell` | FE-UX-DASH-2 | `DashboardLayout.jsx` | Low | ~10 | Manual check (should be sequenced after PR-11 ships) | Revert | 27 (after PR-11) |
| PR-28 | `fix(auth): correct ResetPassword missing-token copy` | FE-UX-9 | `ResetPassword.jsx`, i18n string files | None | ~10 | Manual check with a malformed reset URL | Revert | 28 |
| PR-29 | `fix(enroll): add double-submit guard to payment button` | FE-UX-10 | `Enroll.jsx` | None | ~3 | Manual rapid-double-click check | Revert | 29 |
| PR-30 | `chore(deps): remove unused react-hook-form` | dead dependency | `package.json` | None | ~1 | Build succeeds | Revert | 30 |
| PR-31 | `chore(config): remove dead VITE_DAILY_DOMAIN, tighten ESLint unused-vars pattern, fix seoRoutes drift` | batch of trivial/config-only items | `.env.example`, `eslint.config.js`, `package.json` | Low | ~15 | Lint passes, sitemap includes the 2 missing routes | Revert per item | 31 |
| PR-32+ | `test: add coverage for Enroll/Login/Register/HomeworkPage/Billing` (one PR per surface, ongoing) | FE-TEST-1/2 | new test files | None | ~100 each | Adds tests only | N/A | Parallel/ongoing, not gating |
| PR-Q1 | `refactor(quran): extract narrower reading contexts (preferences/navigation/playback)` | FE-ARCH-3 | `Quran.jsx` + new context files + ~12 child components | High | ~600+ | Full manual pass on every Quran nav/reading-mode combination + new component tests | Revert to monolithic `Quran.jsx` (keep a tagged pre-refactor commit) | Separate, dedicated release — not bundled with anything above |
| PR-E1 | `refactor(errors): add per-zone ErrorBoundary/Suspense` | FE-ARCH-1 | `App.jsx` | Low-Med | ~40 | Force an error in each zone, confirm isolated fallback | Revert | Independent, any time |

---

## Phase 4 — Dependency Review

Real data already captured during the audit (`npm outdated`/`npm audit`, re-confirmed unchanged during verification):

| Package | Current | Latest | Advisory | Upgrade priority |
|---|---|---|---|---|
| `vite` | 5.4.21 | 8.1.3 | Indirect via esbuild (dev-only, moderate/high) | P2 — 3 majors behind, real work but no production runtime risk forcing urgency |
| `@vitejs/plugin-legacy` | 5.4.3 | 8.1.0 | Same chain | P2 — tied to the Vite major bump |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.3 | None | P3 |
| `react`/`react-dom` | 18.3.1 | 19.2.7 | None | P2 — real benefits (Actions, `ref`-as-prop, document metadata) but a deliberate, tested migration, not a drop-in bump |
| `eslint` | 9.39.4 | 10.6.0 | None | P3 — low-risk since already on flat config |
| `react-hook-form` | 7.80.0 | current | None | **P0 — remove, zero usages, pure dead weight** |
| `lucide-react` | 1.23.0 (installed) | not independently re-verified this session — do not assert a "latest" figure without a fresh `npm view` check | None | P3 |
| esbuild (transitive) | ≤0.24.2 | — | GHSA-67mh-4wv8-2f99, dev-server-only | P2, bundled with the Vite major bump |

**No production-runtime-affecting vulnerability exists in the current dependency tree.**

---

## Phase 5 — Production Readiness

| Fix | Hot-fixable? | Independent? | Feature-flaggable? | Rollback-safe? |
|---|---|---|---|---|
| FE-UX-1 (modal CSS) | Yes | Yes | Not needed | Yes, trivially |
| FE-SEC-2 (fake success) | Yes | Yes | Not needed | Yes |
| FE-SEC-1 (homework upload) | No — depends on backend confirmation | Yes, once scoped | **Yes, and should be** — gate the real-upload path behind a flag so it can be disabled instantly if the new upload integration misbehaves | Yes |
| FE-UX-5 (broken CTA) | Yes | Yes | Not needed | Yes |
| FE-UX-QURAN-1 (audio bug) | Yes | Yes | Not needed | Yes |
| FE-PERF-3 (i18n lazy-load) | No | Yes, independently | Could flag old/new loading strategy during rollout for safety | Yes |
| FE-A11Y-1 (LangSwitcher) | No | Yes | Not needed | Yes |
| FE-ARCH-3 (Quran refactor) | No | No — its own release | Strongly recommended — flag the new context-based state management so it can be disabled if a regression surfaces post-launch | Yes, if a pre-refactor tag is kept |

---

## Phase 6 — Enterprise Review (role panel)

**Staff Frontend Engineer:** the PR breakdown is appropriately granular; PR-1's three-file CSS split is the right call over a single global-index addition. One concern: PR-10 (DsChart split/replace) shouldn't be scoped or estimated until PR-9's tree-shaking spike actually runs — the plan correctly sequences this, but flag it as a hard gate, not a soft suggestion.

**Accessibility Specialist:** FE-A11Y-1's native-`<select>` alternative deserves more weight than a footnote — it eliminates an entire class of custom-ARIA-widget maintenance burden, not just this one bug. Recommend the Execution Spec explicitly ask design for a decision early, since it blocks PR-11 and (transitively) PR-27. FE-A11Y-2's focus-trap fix in the shared hook is correctly identified as fixing 5 modals at once — good leverage.

**Security Engineer:** No disagreement with severity calibrations. FE-SEC-1's backend-dependency flag (does the upload endpoint exist?) is the single most important unresolved question in the entire plan and should be resolved before any implementation sprint is scheduled, not discovered mid-sprint.

**Performance Engineer:** FE-PERF-3's lazy-i18n fix and FE-PERF-1's chart investigation are correctly prioritized above FE-ARCH-3's larger refactor — cheap, real wins first. Add one thing: measure the real Lighthouse LCP improvement after PR-7 (i18n) ships, since the audit's own reasoning ties LCP softness directly to the eager i18n bundle — this closes the loop with real data rather than assuming the fix worked.

**Tech Lead:** 31+ numbered PRs plus an ongoing test-coverage stream and a separate PR-Q1 refactor project is a multi-week effort at the stated one-PR-at-a-time cadence, matching the backend engagement's equivalent scale. Communicate this cadence expectation up front. FE-ARCH-3 (PR-Q1) should be explicitly scheduled as its own project with its own timeline, not squeezed into the same cadence as the numbered fix PRs.

**No unresolved disagreements** — every role's concern is already reflected in the plan structure above or explicitly flagged as an open question for the Execution Spec to carry forward.