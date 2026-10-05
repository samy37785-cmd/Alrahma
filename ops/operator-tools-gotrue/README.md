# Operator tools: real GoTrue test stack

This is the template for the disposable Supabase-CLI stack used only by
`backend/scripts/ops/operator-tools.real-gotrue.test.mjs`. That test runs the
owner-run Super Admin tools end to end against real Postgres, GoTrue (Auth)
and Kong:
- `supabase-first-super-admin-bootstrap.mjs`;
- `supabase-owner-bootstrap.mjs`;
- the `bootstrap-manifest.mjs` collector.

It is the same configuration as `ops/stage2jb-r11-gotrue`, with one
difference: the local mail catcher (Mailpit, `[local_smtp]`) is **enabled**.
The test reads the real invite email that GoTrue sends, takes the link from
it as the owner would, and counts the emails to prove that exactly one invite
is ever sent.

The test never uses this directory directly. Each run copies
`supabase/config.toml` into a temp workdir with a unique `project_id` and
random free ports
(`backend/scripts/migration/lib/disposable-supabase-stack.mjs`), checks that
every URL it gets back is `127.0.0.1`, and always runs
`supabase stop --no-backup` at the end. It never connects to the real
Supabase project.
