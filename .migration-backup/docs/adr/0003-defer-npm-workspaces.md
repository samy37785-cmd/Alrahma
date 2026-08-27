# ADR 0003 — Defer the npm-workspaces migration

**Status:** accepted (refactoring roadmap Phase 1b, exercised abort clause) · **Date:** 2026-07-14

## Context

The roadmap scheduled an npm-workspaces migration (single root lockfile,
hoisted installs) as a separate, high-risk PR with an explicit instruction to
"abort cheaply if platform builds resist."

## Decision

Deferred. Three compounding reasons:

1. **Platform build settings are outside the repo.** Vercel's root-directory/
   install-command configuration lives in the Vercel dashboard and cannot be
   validated or changed from this repository; Render installs from
   `backend/`. A single root lockfile breaks both packages' standalone
   `npm ci` without coordinated dashboard changes that can't be tested in a
   PR.
2. **It amplifies a documented CI hazard.** The frontend lockfile must be
   regenerated with npm 10.8.2 (npm/cli#4828 silently drops platform-specific
   optional deps). A combined root lockfile would put the backend's
   dependency graph inside the blast radius of that bug.
3. **Marginal residual benefit.** Phase 1 already delivered the DX alignment
   (engines pinned to Node ≥20, `.nvmrc`, `.editorconfig`, docs); what
   remains is install dedup — nice, not worth risking two deploy pipelines.

## Revisit when

Deploy configuration moves into the repo (e.g. both platforms building from
the root with explicit install commands), or the npm optional-deps bug stops
constraining lockfile tooling.
