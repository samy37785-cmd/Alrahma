# Canonical Repository Cleanup — Stage 2F Part B

Date: 2026-09-07

This is Part B of the "Stage 2F — Actual Final Closure, Then Canonical
Cleanup" task, performed only after Part A closed (PR #65 merged,
`main` == `origin/main` at `f5a1d8d564efc7666db69f7f172de083c555dcf0`).
It classifies and, where proven safe, relocates or deletes non-canonical
residue in the repository root. **No functional, design, or Production
change is included in this pass.**

## Starting point

| Item | Value |
|---|---|
| Starting branch | `main` (fast-forwarded to `origin/main`) |
| Starting commit | `f5a1d8d564efc7666db69f7f172de083c555dcf0` |
| Working branch | `chore/stage-2f-canonical-cleanup` |

## Classification scheme

KEEP / MOVE / MERGE / DELETE / ARCHIVE / UNKNOWN, per the governing task's
explicit instruction. **UNKNOWN is never deleted.** Every DELETE or ARCHIVE
below required proof of non-use (`git ls-files`, `Grep` across
`artifacts/`, `backend/`, `lib/`, config files, and deployment config,
plus `git log` where relevant) before any filesystem action — matching the
rigor of the pre-existing Stage 1 pass recorded in
`docs/repository-hygiene-baseline.md`.

## Items reviewed

| Path | Classification | Evidence / reasoning |
|---|---|---|
| `.migration-backup/` (667 tracked files) | **KEEP** (no action) | Pre-existing, deliberate decision from Stage 1 (`docs/repository-hygiene-baseline.md`): explicitly retained rollback evidence, to be reviewed for deletion only *after* a successful Remote (real Supabase project) production cutover and after the agreed retention window expires. Production Cutover has not happened. Honored as-is, not re-decided. |
| `artifacts/api-server` (11 tracked files, `@workspace/api-server`) | **ARCHIVE** → `archive/api-server/` | `docs/product-scope-audit.md` and `artifacts/al-rahma-academy/docs/localization-audit.md` independently establish it was a thin same-origin `/api` reverse-proxy shim for the Replit dev environment (only real local route: `GET /healthz`), structurally superseded by `vercel.json`'s own `rewrites` (`/api/:path*` → the real Render backend), which is confirmed live via every one of PR #65's own successful Vercel checks. `Grep` across the repo found zero references to `api-server` from `al-rahma-academy`, `backend`, or any deployment config. Not hard-deleted — moved intact to a clearly-labeled `archive/` location, out of `pnpm-workspace.yaml`'s package globs, so nothing loses history and it can be recovered or hard-deleted later with full evidence intact. |
| `artifacts/mockup-sandbox` (69 tracked files, `@workspace/mockup-sandbox`) | **ARCHIVE** → `archive/mockup-sandbox/` | A Replit-platform-generated design-mockup scaffold (`.replit-artifact/artifact.toml`, `mockupPreviewPlugin.ts`, a generic, unmodified shadcn/ui component dump). `Grep` found zero references from any real product code, route, or build config. Same archive rationale as `api-server`. |
| `attached_assets/logo-src/` (4 files) | **KEEP, active use** | Directly referenced by `artifacts/al-rahma-academy/vite.config.ts:74` and by a real test, `artifacts/al-rahma-academy/src/test/officialLogoAssets.test.js:18` (`SOURCE_DIR = path.join(REPO_ROOT, 'attached_assets', 'logo-src')`). Deleting or moving it would break the build/test. |
| `attached_assets/Pasted-After-completing-...txt`, `attached_assets/Pasted-Continue-working-...txt` (2 files) | **DELETE** (done) | Zero references anywhere in the tracked tree (`Grep`, full-repo). Plain-text Replit chat-paste dumps, not code, not documentation, not referenced by any script or test. |
| `screenshots/` (4 tracked `.jpg` files) | **KEEP** | Small, static, harmless design/QA reference images; no evidence of harm from retention and no proof of non-value found. Not part of this task's specifically-named cleanup targets beyond a size/purpose sanity check. |
| `.agents/` (`memory/MEMORY.md`, `memory/fresh-browser-verification.md`) | **KEEP** | A deliberate, actively-maintained project-level agent knowledge base (not generated clutter, not Replit tooling). Independently corroborated as out-of-scope-for-deletion by `docs/legacy-roles-dashboard-reachability-audit.md`. |
| `.replit`, `.replitignore`, `replit.md` | **KEEP** | Same audit (`docs/legacy-roles-dashboard-reachability-audit.md`) classifies these as "not part of app runtime... out of scope." Genuine ambiguity remains about whether Replit is still used as an editing environment separate from the now-Vercel/Render production deployment, so no destructive action was taken absent proof either way. |
| Root `dist/` | **N/A — does not exist as tracked content** | `git ls-files \| grep dist/` → 0 matches anywhere in the tree; the only `dist/` on disk is `artifacts/al-rahma-academy/dist/`, a build output directory already covered by `.gitignore` and confirmed untracked. No action needed. |
| Root `node_modules/` | **N/A — does not exist as tracked content** | `git ls-files` under any `node_modules/` path → 0 matches. Already correctly gitignored everywhere, including inside the newly-archived `archive/api-server/node_modules` and `archive/mockup-sandbox/node_modules` (confirmed via `git check-ignore -v`). No action needed. |
| Duplicate top-level configs (`tsconfig*`, `vite.config*`, `eslint.config*`, `vitest.config*`) | **KEEP, not duplicates** | Full-tree sweep found only `tsconfig.base.json` and `tsconfig.json` at the repository root — these are the legitimate root TypeScript project-references entry points, actively used by `package.json`'s own `typecheck:libs` (`tsc --build`) script. No stray/duplicate copy of any per-package config was found at the root shadowing a real one under `artifacts/`. |

## Actions taken

1. `archive/api-server/` created from `artifacts/api-server/` (`git mv`-equivalent — staged as a rename; all 11 files' history preserved).
2. `archive/mockup-sandbox/` created from `artifacts/mockup-sandbox/` (69 files, history preserved as renames).
3. Deleted the two proven-unused `attached_assets/Pasted-*.txt` files.
4. `pnpm-lock.yaml` regenerated (`pnpm install`) — confirmed both archived packages' entries are cleanly pruned from the lockfile (`grep -c "api-server|mockup-sandbox" pnpm-lock.yaml` → `0`).
5. `pnpm-workspace.yaml` required **no edit**: its package globs (`artifacts/*`, `lib/*`, `lib/integrations/*`) never covered `archive/`, so both packages are automatically out of `pnpm install`/`typecheck`/`build` scope.

## Verification (fresh, post-cleanup, from a clean working tree)

| Check | Result |
|---|---|
| `tsc --build` (root `typecheck:libs`) | Clean, no errors |
| `pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck` | "Scope: 2 of 7 workspace projects" (down from 4 — confirms `api-server`/`mockup-sandbox` are cleanly gone from the workspace graph); `al-rahma-academy` and `scripts` both **Done**, 0 errors |
| `pnpm -r --if-present run build` | Only `al-rahma-academy` builds (the only buildable package remaining); succeeded, `✓ built in 40.72s`, only the pre-existing >500 kB chunk-size warning |
| Backend `npm test` | **318 tests, 314 pass, 0 fail, 4 skipped** — identical to the pre-cleanup Stage 2F baseline |
| `lib/db` `npm run test:db` | **Fully green, 230/230** (exact assertion contract satisfied) |
| Frontend `npm test` | **74 test files, 3918 tests, 0 failures** |
| Frontend `npm run typecheck` | Clean, 0 errors |
| Frontend `npm run build` | Succeeded, `✓ built in 40.72s` |
| `git diff --check --cached` | Clean, no output |
| Secret scan on staged diff | Clean — no credential-shaped matches in the cleanup diff (renames + 2 deletions + lockfile regen only; no `.env`/secret file touched) |
| `artifacts/al-rahma-academy/public/sitemap.xml` | The known `prebuild`-hook line-ending-only side effect reappeared after the build and was reverted (`git checkout --`), keeping the diff free of unintended noise |

## Confirmation

No functional, design, or Production change is included in this diff — it
is renames (2 archived packages), 2 file deletions (proven-unused paste
dumps), and a lockfile regeneration reflecting those moves. No migration,
Supabase, Render/Vercel env, or `.env`/secret file was read, moved, or
modified. No canonical frontend (`artifacts/al-rahma-academy`), backend
(`backend/`), database (`lib/db`), or deployment config (`vercel.json`)
path was touched.
