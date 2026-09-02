# Stage 1 + Trust Marketing Integration Review

Local integration and corrective verification of `feat/stage1-url-closure`
and `fix/trust-marketing-localization` into `fix/stage-02c-final-user-admin-closure`.
No push, no remote merge, no PR, no deploy, no Supabase/SQL/migration
access at any point.

## Source state

| Ref | SHA |
|---|---|
| Base (`fix/stage-02c-final-user-admin-closure`, pre-integration) | `21692c0f95e79ed5e138b01778185c77111fbc4` |
| Stage 1 (`feat/stage1-url-closure`, tag `checkpoint/stage-1-url-closure`) | `f4741bb5342eee5f7a3e89efe0c1dc534584fc6c` |
| Trust (`fix/trust-marketing-localization`, tag `checkpoint/trust-marketing-localization-r1`) | `62a82898d179db8ef9ac8ecdd29deab49d4b4771` |

Both source SHAs are ancestors of the final integrated HEAD (verified via
`git merge-base --is-ancestor`, exit 0 for both).

## Merge

- Stage 1: `git merge --ff-only feat/stage1-url-closure` — fast-forward,
  resulting HEAD exactly `f4741bb...`, no new commit.
- Trust: `git merge --no-ff fix/trust-marketing-localization` — real merge
  commit `b422996...`, **zero conflicts**. Independently confirmed before
  merging (not assumed from either branch's own report): `comm -12` on the
  sorted file lists from `git diff --name-status` for both branches
  against the base showed **zero files in common** — Stage 1 touches only
  URL/routing infrastructure, Trust touches only marketing
  components/i18n/data/docs, so the merge tools never had a real conflict
  to resolve.

## Shared/touched files

- **Stage 1** (`21692c0..f4741bb`): 8 new test files, `seoSchema.test.jsx`
  modified, plus `src/utils/{urlCanonicalize,bootRedirect,localePath,
  assetOrApiPath}.js`, `vite.config.ts`, `main.jsx`, `App.jsx`,
  `Breadcrumbs.jsx`, `PageBar.jsx`, `docs/localization-audit.md`.
- **Trust** (`21692c0..62a8289`): 37 files — 29 modified, 1 deleted
  (`LiveCounter.jsx`), 6 new test files, 1 new doc
  (`trust-marketing-remediation.md`). No overlap with Stage 1's file list.

## Fixes applied during this review

All commits below are on `fix/stage-02c-final-user-admin-closure`
directly, each independently tested (full suite + typecheck + build)
before committing.

1. **`66c4e2a` fix(url-redirect): restrict canonical 308 middleware to
   GET/HEAD.** The `canonicalUrlRedirect` Vite middleware had no
   `req.method` check — extracted the redirect decision into
   `computeCanonicalRedirect()` (mirrors why `isAssetOrApiPath.js` was
   already extracted) and gated it on GET/HEAD. Empirically confirmed live
   against the preview server: `curl -X POST /fr?lang=fr` now returns 404,
   never a 308.
2. **`858f26d` docs(scope): correct overstated production-308 deployment
   claim.** `.replit`'s `[deployment]` block has no `run`/`build` key
   anywhere in the tracked tree — the real production run command is not
   locally provable. Narrowed the doc's claim accordingly; real-production
   308 status is DEFERRED, not asserted.
3. **`d8a50cf` fix(test): close raw-anchor guard gap for a bare
   `href="/"`.** The whole-tree AST guard's `isRootRelative()` regex
   (`/^\/[^/]/`) couldn't match the single-character string `"/"`, so a
   hardcoded `<a href="/">` (bypassing the documented `homeHref()`
   exception) would have silently passed. No such literal exists in
   production source today; fixed the regex and added direct unit
   coverage.
4. **`3657791` refactor(marketing): remove dormant social-proof
   components.** `StatsBanner.jsx`/`Testimonials.jsx` had been gutted to
   `return null` but kept "as a place to rebuild later" —
   `Testimonials.jsx` already had zero real consumers; `StatsBanner.jsx`
   was still imported and rendered from `Home.jsx`. Deleted both outright,
   decoupled `StatsBanner` from `Home.jsx`, removed ~370 lines of now-dead
   CSS across 8 stylesheets (verified zero remaining JSX consumers per
   selector before removal).
5. **`8c568cd` fix(trust): remove remaining unsupported usage claims from
   ToolsHub.** Closed the task's explicitly-named known-deferred gap:
   `TOOLS_HUB_TEXT` in `i18n/content.js` carried six unsupported per-tool
   usage figures and a "Join 1,200+ students" claim (with fake avatar
   circles) in all six languages, untouched by the original remediation.
   Removed following the same precedent already used for TrustBar.
6. **`4f39eea` fix(trust): remove fabricated testimonial and stats from
   Enroll.jsx.** New finding, not previously known: the actual
   enrollment/checkout page (outside Trust's diff entirely) hardcoded a
   fabricated named quote ("Fatima K., Manchester") and three unsupported
   statistics, English-only, never localized. Removed outright.
7. **`0a7873c` docs(scope): correct trust-marketing evidence after
   integration review.** Updated `trust-marketing-remediation.md`'s
   Unknown Register and component-disposition notes to match what was
   actually found/fixed above.

## Test-count reconciliation

Recomputed from first principles, not from either branch's own report:

| Stage | Files | Tests | Delta |
|---|---:|---:|---|
| True base (`21692c0`, re-measured on current tree minus Stage 1's own `seoSchema.test.jsx` addition) | 51 | 1665 | — |
| + Stage 1 (`seoSchema.test.jsx` +3, 8 new files +67, as authored) | 59 | 1735 | matches Stage 1's own reported total exactly |
| + Trust (6 new files, empirically run twice, consistently 122 tests — not the "117" a prior figure implied) | 65 | 1857 | — |
| + this review's fixes (`internalLinkGuards.test.js` +3, `canonicalRedirectDecision.test.js` +4 new, `trustMarketingContent.test.jsx` net +14 across three rounds of edits) | 66 | 1866 | matches the live full-suite run exactly |

Note: a prior report's headline figures ("base 51/1650," "Trust final
57/1767 with 6 files/117 tests") do not reconcile against direct
measurement — true base is 1665 tests (not 1650) and Trust's 6 new files
contain 122 tests (not 117), both re-confirmed by directly executing the
current tree's copies of those exact files twice. The **file-count**
breakdown of "37 files" for Trust (29 modified + 1 deleted + 6 new tests +
1 new doc) is correct; a "30 modified" sub-count in some retelling was off
by one. Final, live, twice-run total: **66 test files, 1866 tests, exit
code 0 both times**, no unhandled errors, no flaky counts between runs.

## Findings review summary

**Stage 1 (URL closure)** — re-reviewed adversarially (open-redirect,
percent-encoding, query-reorder, backslash-confusion, HTTP-method safety),
confirmed safe by construction and empirically probed via a scratch script
(query order preserved; percent-encoding passed through byte-for-byte;
`//evil.com/path` collapses to a same-origin `/evil.com/path` since
`canonicalPathname` is structurally guaranteed to start with exactly one
`/`; the middleware never reads `url.host`/`origin`/`protocol`). One real
gap found and fixed (missing method guard, #1 above). Runtime fallback
(`bootRedirect.js`/`main.jsx`) reviewed and confirmed: runs pre-mount,
uses `replace()`, skips `createRoot()` on redirect, preserves hash. Real
production-308 status is honestly unproven and documented as deferred
(#2 above). Internal navigation (raw anchors, `goHome()`/`homeHref()`
exceptions, alias guards) reviewed via the whole-tree AST guard, one gap
found and fixed (#3 above). BreadcrumbList verified correct for en/fr/ar
via `seoSchema.test.jsx` (locale never in names, always in URLs, root gets
a trailing slash, internal paths never do).

**Trust (marketing remediation)** — dead-null-component pattern found and
fixed (#4). The one item the task named explicitly as a known deferred gap
was closed (#5). A second, previously-unknown gap was found and closed
(#6, Enroll.jsx). Pricing/checkout logic independently verified untouched
by directly reading Trust's diff to `Pricing.jsx` line by line (only the
countdown timer, spots-scarcity, and de-numbered trust labels changed;
`plans`, `selectedPlan`, `currencyCode`, `CheckoutModal` props unchanged).
The `TEACHERS` dataset (10 named profiles with fabricated `rating`/
`reviews`/`hours` figures, explicitly commented in-code as "a fictional
marketing directory") was independently rediscovered during this review
and found to already be correctly registered in the Unknown Register as a
product-owner-blocked item — left untouched, not silently fixed, matching
the task's explicit rule against unilaterally altering institutional
identity claims.

## DB offline guards

- `check:published-migrations`: **4/4 passed** (no CRLF/checksum issue
  this time; the base worktree's checkout was already correct).
- `test:db:orchestrator-selftest`: **26/26 passed**.

## Repository gates

- `git status --short`: clean throughout, before and after every commit.
- `git diff --check`: only pre-existing Markdown trailing-double-space
  (intentional line-break syntax) in `localization-audit.md`, not
  introduced by this review, not a real defect.
- Secrets scan over the full `21692c0..HEAD` diff: zero matches for
  key/secret/token/password/PEM-header/Stripe-key patterns.
- `.env`: never read, never touched, at any point in this session.
- No migration/SQL/`backend/` file appears anywhere in the diff.

## Production 308 — real status

**Not proven.** Confirmed locally via `vite preview`. `.replit`'s
`[deployment]` block declares `router = "application"` and
`deploymentTarget = "autoscale"` but has no `run`/`build` key anywhere in
the tracked tree — the actual command a real Replit deployment executes
lives in Replit's own platform-side configuration, outside this repo, and
was correctly left untouched (out of this task's authorized file scope).
Do not treat production as covered by this middleware without separately
confirming what the live deployment actually runs.

## Preview HTTP walkthrough (all live-tested against `vite preview`, redirects disabled)

| URL | Status | Location |
|---|---|---|
| `/` | 200 | — |
| `/fr` | 308 | `/fr/` |
| `/fr/`, `/it/`, `/ar/` | 200 | — |
| `/fr/resources/faq` | 200 | — |
| `/?lang=fr` | 308 | `/fr/` |
| `/courses/ijazah?lang=ar&foo=bar` | 308 | `/ar/courses/ijazah?foo=bar` |
| `/fr/courses/ijazah?lang=de&foo=bar` | 308 | `/fr/courses/ijazah?foo=bar` (path prefix wins over query) |
| `/xx/` | 308 | `/xx` (invalid lang never invents a prefix) |
| `/xx` | 200 | already canonical |
| `/courses/` | 308 | `/courses` |
| `/favicon.svg`, `/api/healthz` | 200 | excluded from middleware |
| `POST /fr?lang=fr` | 404 | confirms the method guard — no redirect issued |

Both multi-condition redirects (`/fr`, the query+prefix-conflict case)
resolve in exactly one hop to a real 200 when followed (`-L`), confirmed
via `curl -w "redirects=%{num_redirects}"`.

## Browser walkthrough — DEFERRED

Chrome DevTools MCP was available as a tool but failed to connect twice:
`Could not connect to Chrome. Check if Chrome is running. Cause: Could
not find DevToolsActivePort for chrome at ...`. Per this task's explicit
instruction, Edge and Playwright were not substituted. The preview server
was started and stopped cleanly around both attempts; port 19795 confirmed
closed afterward. **No visual/hydration/console-error walkthrough was
performed** — this is logged as deferred, not claimed as done.

## Unknown Evidence Register

See `docs/trust-marketing-remediation.md`'s "Unknown — not silently
changed" and "Deferred items" sections (updated by this review). Summary:
Al-Azhar accreditation, founding year, company identity/address/phone,
founder's story, and the `TEACHERS` dataset's fictional-profile status are
all explicitly flagged as **publication blockers requiring product-owner
evidence** — none were altered by this review. ToolsHub's and Enroll.jsx's
unsupported figures were **safe neutralization candidates** (no
qualitative claim was lost by removing them) and have been closed.

## What blocks Stage 1b / what is now ready

- **Ready**: Stage 1's URL model (dev/preview-proven), Trust's marketing
  content (testimonials/stats/urgency removed, ToolsHub and Enroll.jsx
  gaps closed), the integrated test/typecheck/build/DB-offline gates.
- **Blocks Stage 1b** (unchanged from Stage 1's own scope note): a real
  prerendered-static-HTML pipeline for crawlers remains explicitly
  out of scope for this task, as it was for Stage 1 itself.
- **Blocks any "production is closed" claim**: the real Replit deployment
  run command, per above.
- **Blocks any change to the `TEACHERS` dataset or Al-Azhar/founding/
  identity claims**: needs an explicit product-owner decision, not
  something this or any prior integration pass should do unilaterally.

## Final integration state

- Merge commit: `b422996...`
- Final HEAD after all fixes: `0a7873c...`
- Checkpoint tag: `checkpoint/stage1-trust-integrated` (see repository —
  created after this document, pointing at final HEAD)
- Both source SHAs (`f4741bb...`, `62a8289...`) confirmed ancestors of
  final HEAD.
- No push, no remote merge, no PR, no deploy, no Supabase/SQL/migration
  access at any point in this integration.
