# Al-Rahma Frontend — Final Engineering Execution Specification

**Status: BLUEPRINT ONLY. No code has been modified as part of this specification. Nothing has been committed, branched, or pushed.** (Two throwaway empirical test files were created, executed, and deleted during the Independent Review stage to obtain real evidence — confirmed via `git status` to leave zero trace; this is documented in `FRONTEND_INDEPENDENT_REVIEW.md`.)
**Source of truth:** `FRONTEND_AUDIT.md` → `FRONTEND_VERIFICATION.md` → `FRONTEND_INDEPENDENT_REVIEW.md` → `FRONTEND_PATCH_PLAN.md`, in that order of authority where any two disagree (each stage's corrections supersede the one before it).
**Execution model:** identical to the backend engagement's established cadence — **one PR at a time**, CI must pass, explicit approval required before the next PR starts. No batch execution regardless of how independent two adjacent PRs appear.

---

## 1. Exact Implementation Order

Matches `FRONTEND_PATCH_PLAN.md`'s Phase 3 PR table exactly, with the sequencing constraints below layered on top:

**Tier 1 — Critical/High fixes (PR-1 through PR-7), in this exact order:**
PR-1 (modal CSS) → PR-2 (fake success screen) → PR-3 (homework upload, **blocked pending the backend-endpoint question below**) → PR-4 (broken CTA) → PR-5 (audio timeout bug) → PR-6 (Enroll/Checkout redundant entry) → PR-7 (i18n lazy-load).

**Tier 2 — Performance/investigation (PR-8 through PR-10):**
PR-8 (dead import removal, no dependency) → **PR-9 (recharts tree-shaking spike — informational only, produces no merge, decides PR-10's actual scope)** → PR-10 (chart chunk fix, scope determined by PR-9's result).

**Tier 3 — Accessibility (PR-11 through PR-15):**
PR-11 (LangSwitcher keyboard/native-select — **blocked on a design decision, see §8**) → PR-12 (modal focus-trap) → PR-13 (gold contrast) → PR-14 (missing `lang="ar"`) → PR-15 (aria-live counters).

**Tier 4 — Security hardening (PR-16 through PR-19):**
PR-16 (http.js interceptor/timeout) → PR-17 (CSRF truncation) → PR-18 (DOMPurify migration) → PR-19 (CSP hosts).

**Tier 5 — Tooling/hygiene (PR-20 through PR-22):**
PR-20 (CSS syntax fix) → PR-21 (Prettier sweep + CI enforcement) → PR-22 (Node version pin).

**Tier 6 — Remaining UX/polish fixes (PR-23 through PR-31):**
Any order within this tier is safe — none depend on each other — **except PR-27, which must follow PR-11** (it adds the language switcher to the dashboard shell using the same component PR-11 fixes; sequencing it first would just re-introduce the same keyboard-accessibility gap into a second location).

**Ongoing, parallel, non-gating:** PR-32+ (test-coverage expansion) runs continuously alongside all six tiers above and never blocks any of them.

**Separate, dedicated releases (not part of the numbered sequence):** PR-Q1 (Quran God-component refactor into narrower contexts) and PR-E1 (per-zone ErrorBoundary/Suspense) are each their own project, schedulable independently of the tiers above, on their own timeline.

### Hard sequencing dependency, restated for clarity
PR-9 must complete (and its result reviewed) **before** PR-10 is scoped, written, or estimated — PR-10 is either a module split or a library replacement depending entirely on what PR-9 discovers about recharts' real tree-shaking behavior. Do not skip PR-9 to save time; doing so risks shipping PR-10 with zero actual size benefit.

---

## 2. Exact Merge Order

Identical to the Implementation Order in §1, with one addition from the Independent Review: **insert a minimum one-business-day observation window after PR-1 (the modal CSS fix) before merging PR-2**, since PR-1 is the single highest-consequence fix in this entire plan (it un-breaks the actual payment UI on the Enroll/Pricing/Billing/Admin routes) and deserves a dedicated window to confirm no regression before the next change lands on top of it. No other pair of adjacent PRs in this plan carries comparable stakes to warrant a similar mandatory pause, though normal team judgment on batching multiple small Tier-5/6 PRs into a single day's review capacity is reasonable.

---

## 3. Exact Deployment Order

Matches merge order. This is a static-SPA deployment on Vercel with no server-side component of its own (the API is a separate, already-audited backend on Render) — every PR in this plan can deploy via the project's existing Vercel pipeline with no deployment-order complexity beyond "deploy after merge, same as today." No PR in this plan requires a deployment sequence different from its merge sequence.

---

## 4. Backend Coordination Required?

**Yes, for exactly one item: PR-3 (FE-SEC-1, HomeworkPage file upload).** This is the single most important open question blocking this plan's execution and must be resolved **before Tier 1 begins, not discovered mid-sprint**:

> **Does the backend's homework-submission endpoint currently accept multipart file uploads (`FormData`), or only the JSON `{notes}` body it's currently sent?**

If the backend's `BACKEND_AUDIT_2026-07-07.md`/`BACKEND_PATCH_PLAN_2026-07-07.md` documents describe or plan a homework-upload endpoint, cross-reference them now. If no such endpoint exists yet, **PR-3 must ship as the "honest interim state" alternative** (Patch Plan §2, Solution B — remove or clearly disable the attachment UI rather than implement a full upload against an endpoint that doesn't exist) — implementing Solution A (the real upload) would then require a **coordinated backend release**, which is out of scope for this frontend-only engagement and would need to be scheduled as a joint frontend+backend project.

**No other item in this plan requires backend coordination.** Every other fix is frontend-only: CSS, client-side accessibility, client-side security hardening (CSP is a Vercel config file, not a backend change), and tooling.

---

## 5. Downtime Required?

**No.** This is a static SPA deployment — every PR deploys via the existing Vercel build pipeline with zero planned downtime, identical to how the app deploys today. None of the fixes in this plan touch server-side infrastructure.

---

## 6. Cache Invalidation Required?

**Partially — one specific case.** PR-7 (i18n lazy-loading) changes how language dictionaries are fetched (from bundled to `import()`-based chunks). Users with the current build already loaded in an open tab, or served a stale cached version of `index.html`/asset manifest from a CDN edge or browser cache, could reference old chunk hashes. This is the **standard Vite/Vercel cache-busting behavior already in place today** (content-hashed filenames), so no *manual* cache invalidation action is required beyond the normal deploy — but this PR should be explicitly monitored post-deploy for any "chunk failed to load" errors in Sentry (the app's existing error-tracking tool), since it's the one change in this plan that alters the JS-chunk-loading topology for every single page load. No other PR in this plan touches caching behavior.

---

## 7. API Versioning Required?

**No.** This plan makes no changes to how the frontend calls the backend API's shape or version — every fix here is either purely client-side (CSS, accessibility, i18n loading strategy) or, for the one exception (PR-3's potential real upload implementation), depends on an *existing or planned* backend endpoint rather than requiring a new versioned contract. If PR-3 does end up requiring backend coordination (per §4), that joint project would need its own API-contract discussion, but that is explicitly out of this document's scope.

---

## 8. Design/Product Coordination Required?

**Yes, for two items, both explicitly flagged as blocking specific PRs rather than the whole plan:**

1. **PR-11 (LangSwitcher accessibility fix)** — the Patch Plan's preferred-solution question ("implement full custom-widget keyboard support" vs. "replace with a styled native `<select>`") depends on whether the current flag+label visual design is a hard product requirement. **This must be decided before PR-11 is scheduled**, and since PR-27 depends on PR-11, resolving it early avoids a downstream schedule risk.
2. **FE-UX-11 (missing trust signals at the Enroll payment step)** and **FE-UX-DASH-1's exact pagination UX** are both flagged in the Patch Plan as needing product/design input on the specific copy/interaction design, not just engineering judgment — these are lower-priority (Tier 6) and can be resolved in parallel with earlier tiers without blocking anything.

**No other item requires design/product sign-off** — the remaining fixes (bug fixes, accessibility compliance, security hardening, tooling) are engineering-judgment calls within the scope this document and the Patch Plan already resolved.

---

## 9. QA Sign-off Required?

**Yes, explicitly for:**
- **PR-1 (modal CSS fix)** — must be manually verified on a genuinely cold session (cleared cache / fresh incognito window) hitting `/enroll`, `/pricing`, `/billing`, and `/admin` directly, specifically *without* having visited the Quran reader first in the same session — this is the exact condition that hid the original bug, and an automated test alone cannot substitute for confirming the fix holds under the real-world cold-visit scenario.
- **PR-3 (homework upload)**, whichever solution path is taken — a real end-to-end submission-with-attachment test against a real or staging backend, not just a mocked unit test, given this finding's entire severity rests on the gap between what a mock proves and what actually reaches a teacher.
- **PR-11 (LangSwitcher)** — the mixed mouse+keyboard+touch interaction test explicitly required by the Independent Review, which by nature requires a human tester, not just an automated assertion.
- **PR-Q1 (Quran refactor, if/when scheduled)** — a full manual pass across every navigation-mode × reading-mode combination given the scale of state being restructured.

**Recommended, not strictly required, for every other PR:** a lightweight smoke-test pass post-deploy, since nearly every fix in this plan is user-facing in some way.

---

## 10. Production Monitoring To Add After Deployment?

**Yes:**
- **Sentry (already integrated in the app) should have an explicit dashboard/alert watch added for chunk-load failures**, specifically during and after PR-7's rollout (per §6) — this is the one change with a genuine, if small, risk of a load-time failure mode that wouldn't otherwise be watched for.
- **A short post-deploy watch window on the Enroll/Checkout conversion funnel** (however the team currently tracks conversion — GA/Clarity, both already integrated) after PR-1 and PR-2 ship, specifically comparing checkout-completion and checkout-abandonment rates before/after — both fixes directly touch this funnel, and real conversion data is the best available confirmation that PR-1's visual fix and PR-2's fake-success removal are both working as intended (e.g., if abandonment-rate reporting suddenly looks different post-PR-2, that's expected — the fake success screen no longer masks true abandonment in whatever funnel analytics existed before).
- **A Lighthouse re-run against the Home page after PR-7 ships**, to close the loop on whether the i18n lazy-loading fix actually improves the previously-measured 3.7s LCP, per the Performance Engineer's request in the Patch Plan's role-panel review — this is real, cheap, and directly validates whether the fix delivered its intended benefit.

---

## Closing note on execution cadence

Per the explicit instruction governing how this plan will be executed: **this specification will be carried out one PR at a time.** Each PR ships, CI must pass, and explicit approval is required before work begins on the next PR in the sequence — no batch execution, regardless of how small or independent two adjacent PRs might appear. Given roughly 31 numbered PRs across six tiers, plus an ongoing test-coverage stream and two separately-scheduled larger projects (PR-Q1, PR-E1), this is realistically a multi-week calendar effort even though the underlying engineering-hours for most individual items are modest — this should be communicated as the expected cadence up front, exactly as the Tech Lead's review in the Patch Plan recommended, so it is not discovered as a surprise partway through execution.
