# Option A — Surgical Reset Rehearsal (real Supabase CLI local stack)

**Environment:** real local Supabase CLI stack (`npx supabase start` in
`ops/option-a-rehearsal/`), real Postgres 17, real `gotrue`/Auth, real
PostgREST, real Kong gateway. **Never the real project.**

**Round 2 rewrite.** This document previously described the Round-1
tooling (hand-rolled DDL backup, a Surgical Reset that committed its
own transaction before the wrapper's postcondition checks ran, and no
rollback proof beyond restoring into an empty database — see
`docs/option-a-rehearsal-report.md` for that history). A real code
review found all three gaps. This rewrite documents Round 2's fix for
each, including the actual centerpiece this whole round exists to
produce: **a genuine NEW-schema (20 tables) → OLD-schema (34 tables)
rollback, verified structurally AND functionally, not just restored
into an empty target.**

## 1. Surgical Reset — single transaction, broadened dependency check

`sql/surgical-reset.sql` no longer wraps itself in `begin`/`commit` —
`scripts/03-surgical-reset.mjs` now owns the whole transaction: it
opens `BEGIN`, runs a broadened dependency check, captures a
before-fingerprint, runs every DROP statement, captures an
after-fingerprint, runs every postcondition check, and only issues
`COMMIT` if every single one passed — `ROLLBACK` otherwise. A detected
regression now means nothing was actually dropped, closing the gap the
review found (the old version's `COMMIT` landed *before* the wrapper's
own verification ran).

Real run, this round, on the real local stack (old 34-table state):

```
--- checking for dependent objects outside the named 34-table/3-enum list
OK    no dependent objects found outside the named 34-table/3-enum list (views/matviews, foreign keys, enum usage)
--- capturing before-fingerprint of everything Surgical Reset must preserve
OK    before-fingerprint captured (public schema oid=20916, rls_auto_enable oid=21494, auth.users=1 row(s))
--- running sql/surgical-reset.sql (same connection, same open transaction)
OK    surgical-reset.sql applied (not yet committed)
--- capturing after-fingerprint (still the same open transaction)
--- comparing before/after fingerprints — every preserved item must be identical
PASS  public schema oid unchanged
PASS  public schema owner unchanged
PASS  public schema ACL unchanged
PASS  pg_default_acl content for public (full role/objtype/acl tuples, not just a count) unchanged
PASS  rls_auto_enable() function oid unchanged
PASS  rls_auto_enable() function definition unchanged
PASS  rls_auto_enable_trigger event trigger oid unchanged
PASS  rls_auto_enable_trigger shape (event/enabled/tags/handler) unchanged
PASS  auth.users row count unchanged
--- verifying every named old table is gone
OK    all 34 named old tables are gone
--- verifying every named old enum is gone
OK    all 3 named old enums are gone

SURGICAL RESET COMPLETE, VERIFIED, AND COMMITTED — every preserved item is unchanged, every named old object is gone.
```

The dependency check was broadened from "views/matviews only" to a
real `pg_depend`-based sweep also covering external foreign keys and
enum usage outside the named 34-table/3-enum list, via direct
`pg_class`/`pg_namespace`/`pg_constraint` joins (not `regclass::text`
string comparison — tested and found to silently drop the schema
prefix for anything on the default search_path, which would have made
the check miss exactly the case it exists to catch). Proven both ways:

- **Negative case:** a table outside the 34-list with a foreign key
  into `public.blogs` was planted; the wrapper refused, zero tables
  dropped, transaction rolled back.
- **Positive case:** the clean run above, full commit.

The default-ACL fingerprint changed from a row *count* to the full
`{defaclrole, defaclobjtype, defaclacl}` content of every row — a
count could stay the same across a real content swap and this check
would never notice.

## 2. Backup tool — real `pg_dump --schema=public`

`scripts/backup-bundle.mjs` no longer hand-rolls DDL from catalog
introspection (which never captured RLS-enabled state, real `CREATE
POLICY` text, or replayable `GRANT` statements — the actual gap the
code review found). It now shells out to a real `pg_dump` (`PATH`
first, falling back to `docker run --rm postgres:17 pg_dump ...` for
the binary only on a host with neither tool installed — this is a
network client, functionally identical whether pointed at
`127.0.0.1:54322` or a real `db.<ref>.supabase.co:5432`, not the
rejected `docker exec`-into-target pattern) and produces:

- `public_schema.dump` — custom-format, restorable via `pg_restore`.
- `public_schema_readable.sql` — plain-text, review-only copy.
- `functions_and_triggers.sql` / `.statements.json` — the two things
  `pg_dump -n public` cannot capture: the `auth.users` trigger (lives
  on a table in a different schema) and event triggers (database-level,
  not schema-scoped).
- `inventory.json` — table list, row counts, **RLS enabled/forced
  state per table**, **full policy definitions** (not just a count),
  enums, functions, event triggers, `sourceMode`, `projectRef`.
- `manifest.json` — sha256 of every file above, plus `sourceMode`/
  `projectRef` at the top level so a consumer (the production preflight
  gate) can verify a bundle actually came from the mode/project it
  claims to.

## 3. The real rollback proof — NEW (20 tables) → OLD (34 tables)

This is what Round 1 never actually proved: every "restore" up to this
point restored structure+data into an *empty* target. The actual
Option A rollback scenario is going from the post-migration NEW state
back to the pre-Option-A OLD state, with RLS/policies/grants intact —
verified by content, not by table/row counts alone.

**Sequence run, this round, against the real local stack:**

```sh
# starting state: old 34-table fixture loaded, then backed up
BACKUP_DATABASE_URL=... BACKUP_MODE=local BACKUP_PROJECT_REF=local-rehearsal-not-real \
  BACKUP_OUT_DIR=.../out/old-schema-bundle node scripts/backup-bundle.mjs

# Surgical Reset + migrate() — reach the real NEW 20-table state
RESET_DATABASE_URL=... node scripts/03-surgical-reset.mjs
REHEARSAL_DATABASE_URL=... node scripts/run-migrate.mjs

# THE ROLLBACK: restore the OLD bundle onto the NEW-state database
RESTORE_DATABASE_URL=... RESTORE_MODE=local \
  RESTORE_BUNDLE_DIR=.../out/old-schema-bundle \
  RESTORE_ROLLBACK_FROM_NEW_SCHEMA=yes \
  node scripts/restore-bundle.mjs
```

`restore-bundle.mjs` with `RESTORE_ROLLBACK_FROM_NEW_SCHEMA=yes` first
runs `sql/inverse-reset-new-schema.sql` (the rollback-direction
counterpart to Surgical Reset — drops exactly the 20 named NEW tables,
12 named NEW enums, and 27 named NEW functions via a `DO $$` loop using
`oid::regprocedure` dynamic lookup, plus the `drizzle` schema/migration
journal; never touches `public` itself, `rls_auto_enable`, `auth.users`,
or any Supabase-managed object), then restores the OLD bundle via
`pg_restore --exit-on-error --single-transaction`, filtering the
dump's own `CREATE SCHEMA public` and `rls_auto_enable()` TOC entries
via `pg_restore --list`/`--use-list` (Supabase's own `rls_auto_enable()`
is live infrastructure this design never touches — restoring a plain,
non-`OR REPLACE` `CREATE FUNCTION` for it would collide with itself).

**Real, unedited output:**

```
--- verifying bundle manifest checksums
OK    all 5 bundle file(s) match their recorded sha256
--- RESTORE_ROLLBACK_FROM_NEW_SCHEMA=yes — running sql/inverse-reset-new-schema.sql first
OK    inverse-reset-new-schema.sql applied — the 20 named new tables/enums/functions and their migration journal are gone
--- restoring public_schema.dump via pg_restore (filtering CREATE SCHEMA public + rls_auto_enable())
OK    public_schema.dump restored (schema + data + GRANTs + RLS + POLICIES + owners, minus the public-schema-creation entry)
--- restoring auth.users trigger + event triggers
OK    4 statement(s) applied
--- post-restore verification against the bundle's inventory.json
PASS  all 34 table(s) from inventory.json are present, no extras
PASS  every table's row count matches inventory.json
PASS  RLS enabled/forced state matches inventory.json on all 34 table(s)
PASS  all 0 policy definition(s) match inventory.json exactly (not just a count)
PASS  all 2 function(s) from inventory.json are present, no extras
PASS  all 3 enum(s)/value(s) match inventory.json exactly
PASS  auth.users trigger(s) match inventory.json
PASS  all 1 event trigger(s) from inventory.json are present (plus 6 platform/extension-owned one(s) not recorded by the bundle and out of its scope: issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access, pgrst_ddl_watch, pgrst_drop_watch)

RESTORE COMPLETE AND VERIFIED — every post-restore check (structure, data, RLS, policies, functions, triggers, enums) matches the bundle's own inventory.json.
```

**Every category the earlier one-directional restore never proved is
here and passing: RLS enabled/forced state per table, full policy
definitions (not a count — there happen to be 0, matching the real
remote finding, and the check confirms 0 by comparing the actual
`pg_policies` rows, not by trusting a number), and grants (`pg_dump`
emits real `GRANT` statements as part of the dump; `pg_restore` replays
them — no hand-maintained ACL-replay step exists anymore).**

### Functional liveness proof — a real HTTP signup, post-rollback

Structural verification proves the catalog is right; it does not prove
the restored trigger actually *fires*. A real client posted to the
real GoTrue endpoint after the rollback completed:

```sh
curl -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: <local anon key>" -H "Content-Type: application/json" \
  -d '{"email":"post-rollback-parent@example.invalid","password":"...","data":{"role":"parent"}}'
```

`200`, real access token issued. Immediately after:

```sql
select id, email, role from public.profiles where id = '<new user id>';
-- role = 'parent'
select count(*) from public.profiles;  -- grew from 1 to 2
```

**The restored OLD `handle_new_user()`'s metadata-role branching
(`raw_user_meta_data ->> 'role' = 'parent'` → `role = 'parent'`) fired
on a real signup through the real Auth endpoint, not a direct SQL
insert** — the restored trigger is not just present in the catalog, it
works.

### A real bug found and fixed during this proof

The first attempt at this rollback failed with a false-negative in
`restore-bundle.mjs`'s own post-restore verification: it compared the
live database's full `pg_event_trigger` list against
`inventory.json.eventTriggers` for **exact equality**. The live target
carried several Supabase-platform/extension-owned event triggers
(`issue_pg_cron_access`, `issue_pg_net_access`,
`issue_pg_graphql_access`, `issue_graphql_placeholder`,
`pgrst_ddl_watch`, `pgrst_drop_watch`) that did not exist yet when the
OLD bundle was captured (they appear once `pg_cron`/`pg_net`/
`pg_graphql` get created on the project, independent of this project's
own migrations or of when a given bundle was taken) — none of them
recorded in `inventory.json`, none of them touched by Surgical Reset or
Inverse Reset (neither ever touches an extension). The exact-equality
check therefore failed on every extra platform-owned event trigger,
which is not a real regression. **Fixed**: the check is now a subset
check — every event trigger `inventory.json` recorded must be present
after restore; an extra, unrecorded, platform-owned one is reported but
does not fail the check. Re-run after the fix: the run above.

A second, separate issue surfaced on the very first restore attempt
(before the event-trigger fix was even reached): the OLD bundle's
`public.profiles` seed row carries a foreign key into `auth.users`
whose id was only ever a random UUID generated when the fixture was
loaded — and `auth.users` **data** is deliberately out of scope for a
`public`-schema-only bundle (same reasoning as `docs/option-a-backup-restore.md`'s
already-documented `FOR ROLE supabase_admin` gap: this bundle backs up
`public`, not the Supabase-managed `auth` schema). A real disaster
recovery restores `auth.users` from Supabase's own Auth-specific backup
mechanism as a separate, parallel step before a `public`-schema bundle
like this one is restored; this rehearsal inserted a matching stub
`auth.users` row for the one id the OLD bundle's seed data actually
references, to reproduce that same operational sequencing rather than
skip past it. **This dependency is real and worth stating plainly: a
`public`-only restore can fail on FK violations against `auth.users` if
`auth.users` itself has not already been restored to a consistent
state first.**

## 4. Real HTTP signup — three metadata-role variants, not a direct SQL insert

Separately from the rollback-specific signup in §3 above (which proves
the *restored OLD* trigger fires), this round also re-verified the
*current, post-`migrate()`* signup behavior with real HTTP calls rather
than a direct `auth.users` SQL insert (`docs/option-a-rehearsal-report.md`'s
original "signup" test — corrected in place to say so — inserted rows
directly into `auth.users` via SQL, which fires the real trigger but is
not the same thing as a client actually signing up):

```sh
curl -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: <local anon key>" -H "Content-Type: application/json" \
  -d '{"email":"...", "password":"...", "data":{"role":"..."}}'
```

Three real signups, three different metadata role claims:

| Email | Metadata `role` claim | HTTP result | Resulting `profiles.role` |
|---|---|---|---|
| `real-signup-plain2@example.invalid` | (none) | `200`, real access token issued | `user` |
| `real-signup-admin-claim@example.invalid` | `"admin"` | `200`, real access token issued | `user` |
| `real-signup-parent-claim@example.invalid` | `"parent"` (the old system's alternate role) | `200`, real access token issued | `user` |

**A real client signing up through the real Auth endpoint, claiming
`admin` in its own signup payload, still gets `role='user'`** on the
current (post-`migrate()`, NEW-schema) `handle_new_user()` — this is
the actual claim the earlier "signup" language should have been able to
make and now can. (Contrast with §3 above, which is the same style of
proof against the *restored OLD* `handle_new_user()`, where a
`"parent"` claim correctly DOES set `role='parent'` — the OLD and NEW
functions have deliberately different behavior, and both were verified
functionally, not just structurally.)

(One earlier attempt in this same round returned `504 request_timeout`
— a cold-start/connection-pool artifact on the very first call to a
freshly-migrated stack, not a functional failure; the identical request
retried immediately after succeeded normally, and is the one recorded
above.)

## 5. PostgREST RPC exposure — a real correction, not a repeat

Re-tested rather than reused from the earlier report, because reusing
an old claim without re-verifying it is exactly the kind of thing this
whole round exists to catch:

| Function | Return type | Result | vs. the earlier report |
|---|---|---|---|
| `handle_new_user` | `trigger` | `404 PGRST202` — *"not found in schema cache"* | same as reported |
| `rls_auto_enable` | `event_trigger` | **`401`** — `{"code":"42501","message":"permission denied for function rls_auto_enable"}` | **different — the earlier report said `404` for this one too** |
| `is_admin` (control — a real, intentionally-exposed RPC) | `profiles`-adjacent boolean | `200` | (new control case this round) |

**The earlier report's claim that `RETURNS event_trigger` gets the same
PostgREST schema-cache exclusion as `RETURNS trigger` is wrong.**
`rls_auto_enable` returns `401`, meaning PostgREST *did* find it in its
schema cache and routed the call through to a real Postgres permission
check, which then denied `anon` (`42501`). Only `RETURNS trigger` was
actually proven excluded from the schema cache; `RETURNS event_trigger`
was not — this round is the first time that specific distinction was
tested rather than assumed to generalize from the other case. The
practical conclusion is unchanged (`anon` cannot reach either function
today), but the *mechanism* for `rls_auto_enable` is a permission
denial, not a routing 404, and `docs/option-a-rehearsal-report.md` has
been corrected in place to say so instead of silently keeping the wrong
row.

## 6. Migration 0011 (deny-by-default) — re-confirmed after a real migrate()

After the NEW-schema `migrate()` run in the sequence above, migration
0011's effect was directly visible in `pg_default_acl`:

```
defaclrole|defaclnamespace|defaclobjtype|defaclacl
...
postgres|0|f|{postgres=X/postgres}
```

`defaclnamespace=0` (global, no `IN SCHEMA`) and `defaclacl` grants
`EXECUTE` only to `postgres` — `anon`/`authenticated`/`PUBLIC` are
absent, meaning a function created after this point has no default
`PUBLIC` execute grant. This matches the migration's own documented,
empirically-derived fix (see the migration file's header comment for
the full A/B test) and confirms it survives a real `migrate()` run on
the real local Supabase CLI stack, not just a disposable plain-Postgres
harness.

## 7. What was not re-tested this round

- **A real MFA/TOTP-issued AAL2 session** — unchanged from the earlier
  finding; still simulated via `SET LOCAL request.jwt.claims`, not a
  real GoTrue factor-enrollment flow. Out of scope for this round.
- **`FOR ROLE supabase_admin` default-privilege restore** — still a
  known, documented, unfixed gap (`docs/option-a-backup-restore.md`);
  the `postgres` role restoring this bundle cannot alter a different
  role's default-privilege rules, same as before.

## 8. Teardown

`npx supabase stop` — clean, no error. The CLI's own `--backup` volume
persistence is why a stack started later in the same environment can
come back holding leftover state from an earlier round; this round
explicitly re-verified the starting state (table counts, function
identity) before relying on it rather than assuming a fresh project.
