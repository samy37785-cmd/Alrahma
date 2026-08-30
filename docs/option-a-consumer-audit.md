# Option A — Runtime Consumer Audit

**Method:** exhaustive search of every branch's tracked git history
(`git grep`/`git ls-tree`/`git log --all`, read-only, no checkout of
other branches) plus the actual working tree, for any reference to
Supabase, the project ref, or the specific old/new table names listed
in the task. This surfaced something the audit needed to establish
first: **which code is actually "the application" in this repository**,
because the working tree currently contains stray, untracked
`backend/`, `frontend/`, `e2e/` directories that turned out to be
leftover files from a *different* branch checkout, not part of this
branch's own design (see below) — auditing them would have been
auditing the wrong thing.

## What "the application" actually is on this branch

- `backend/` (untracked, working tree only) contains **only `.env` and
  `logs/`** — no source code at all. `frontend/` (untracked) contains
  only `dist/`/`coverage/`/`node_modules/` — no `src/`. `e2e/`
  (untracked) contains only `test-results/`. None of these three were
  audited as "the application," because there is no application source
  in them to audit — confirmed by direct listing, not assumed from the
  directory names.
- `git log --all -- backend frontend e2e` shows real history — but on
  **every other branch** in this repo (`main` included), not on this
  docs/db-focused branch lineage. `main` itself carries **no
  `backend`/`frontend` tree at all** (`git ls-tree main` — only
  `.migration-backup`, `artifacts`, `docs`, `lib`, `scripts`, etc.) —
  the same narrow shape as this branch.
- The actual, currently-tracked application source on this branch lives
  under **`artifacts/al-rahma-academy`** (React/Vite frontend) and
  **`artifacts/api-server`** (Express 5 backend) — confirmed by
  `docs/product-scope-audit.md`'s own "Scope of evidence" line, and by
  reading both trees directly.
- `.migration-backup/backend/` (tracked, 667 files) is a **MongoDB +
  Express** application (`mongoose`, `express`, `stripe` in its
  `package.json`) — the OLD, pre-Supabase backend, explicitly labeled
  "historical reference only" by `docs/product-scope-audit.md`'s own
  opening banner.

## The load-bearing finding: no runtime consumer touches Supabase at all

```sh
for b in $(git branch --format='%(refname:short)'); do
  git grep -il "supabase" "$b" -- backend frontend/src
done
```
returned **zero matches across every local branch** (dozens of
`feat/*`/`fix/*`/`redesign/*`/`refactor/*` branches spanning the whole
product's history through 2026-08-26, one day before this DB engagement
started).

Reading `artifacts/api-server/src/app.ts` directly confirms why:
```ts
const upstreamApiOrigin =
  process.env["UPSTREAM_API_ORIGIN"] ??
  "https://academy-backend-cxso.onrender.com";
...
app.use(
  "/api",
  express.raw({ type: () => true, limit: "5mb" }),
  async (req, res) => {
    const target = new URL(req.originalUrl, upstreamApiOrigin);
    ... // proxies everything /api/* doesn't handle itself to upstreamApiOrigin
```
`api-server` is a **thin reverse-proxy shim** in front of a Render-
hosted backend. Its own `src/routes/` contains only a `/healthz` route
— **no business route exists**, and `grep -n "@workspace/db"
artifacts/api-server/src` returns nothing: `@workspace/db` (the
drizzle/Supabase schema package) is a declared `package.json` dependency
but is **never imported by any file**.

The frontend (`artifacts/al-rahma-academy/src`) has real business logic
(`courseApi.js`, admin/parent/teacher components) but calls only
`import.meta.env.VITE_API_URL || '/api'` — confirmed: no
`@supabase/supabase-js` dependency, no `SUPABASE`-prefixed env var
anywhere in the tree, no reference to `difzynyphojgisrfvrkd` anywhere in
the tree (`git grep` for both, zero hits).

**Conclusion: nothing in this repository's tracked history — old
MongoDB backend, new Express proxy skeleton, or the React frontend —
has ever queried the Supabase Postgres database, old schema or new.**
`lib/db`'s drizzle schema exists in complete isolation as a design/
infrastructure layer with no wired-up consumer yet.

## Consumer matrix

| consumer | table/RPC | old schema | new schema | active/dead | required change | evidence |
|---|---|---|---|---|---|---|
| `.migration-backup/backend` (MongoDB/Express) | Mongoose collections (not Postgres tables at all) | N/A — different datastore | N/A | **dead** (explicitly "historical reference only") | none — out of Option A's blast radius entirely | `docs/product-scope-audit.md` banner |
| `artifacts/api-server` (Express 5, tracked, current) | none — proxies `/api/*` to `academy-backend-cxso.onrender.com`; `@workspace/db` imported nowhere | — | — | **dead** (declared dependency, unused) | none required for Option A; a future decision, not this task's | `app.ts`, `routes/index.ts`, `routes/health.ts` read in full |
| `artifacts/al-rahma-academy` (frontend, tracked, current) | calls `courses`, `progress`, `hifz`, `certificates` etc. **via the proxy → Render backend**, never Supabase directly | old LMS concept names, but against Mongo via the proxy, not Postgres | — | active (against the Render/Mongo backend), **not connected to Supabase at all** | none for Option A; relevant only to a *separate*, future "cut the frontend over to the new API" decision | `src/api/courseApi.js`, `src/api/http.js` |
| every `feat/*`/`fix/*`/`redesign/*`/`refactor/*` branch (dozens, through 2026-08-26) | same as above | same | — | same | same | `git grep -il supabase` across all branches: 0 hits |
| `lib/db` (this branch's own package) | the 20-table drizzle schema + RPCs | — | is the new schema | not a consumer — it's the schema/infrastructure itself | N/A | — |

## Specifically checked: the old-scope names named in the task

`student/teacher/parent`, `courses`, `course_progress`, `live_classes`,
`messages`, `profile_children`, `student_records`, `reviews`,
`wishlist_items`, `post_likes`, and old `profiles`/`payments` columns —
searched across `artifacts/` (the real tracked app) and every branch's
`backend`/`frontend/src`. The **frontend** does reference the
LMS-shaped concepts (`courses`, progress, hifz) **but exclusively
through the Render/Mongo proxy path**, never through a Postgres/
Supabase client. No occurrence of any of these names querying Supabase
directly was found anywhere.

## What this means for Option A

The consumer-risk side of the Option A decision is about as clean as it
can be: there is no live code path anywhere in this repository's
history that would break if the Supabase `public` schema were dropped
and rebuilt, because nothing has ever successfully depended on it being
in any particular shape. This is independent evidence from, and
consistent with, `docs/remote-supabase-inventory.md`'s finding that
every table and `auth.users` itself are empty — the absence of data and
the absence of a consumer are two separate facts that happen to point
the same direction here.

**What this does not resolve, and is not this task's to resolve**:
whether/when the product intends to actually wire `artifacts/api-server`
up to `@workspace/db` and cut the frontend over from the Render/Mongo
backend to Supabase — that is a real, separate, future product decision,
not a finding this audit can or should make on its own.
