#!/usr/bin/env bash
# Captures the specific cross-schema / database-level objects a
# `public`-only pg_dump cannot see: the auth.users trigger definition,
# the rls_auto_enable event trigger + its handler function, and the
# public-schema ACL/default-privilege state. Each is its own small,
# explicit, re-runnable artifact — not folded into one big dump — so a
# restore can apply exactly what's needed without dragging in
# Supabase-platform-internal objects a non-superuser role can't recreate
# (see docs/option-a-backup-restore.md for why the whole-database
# pg_dump path was tried and rejected).
set -euo pipefail
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_option-a-rehearsal}"
OUT_DIR="${1:-./out}"
mkdir -p "$OUT_DIR"

docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select 'create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path to ''' || (select array_to_string((select proconfig from pg_proc where proname='handle_new_user' and pronamespace='public'::regnamespace), ',')) || ''' as \$body\$' || (select prosrc from pg_proc where proname='handle_new_user' and pronamespace='public'::regnamespace) || '\$body\$;'
" > "$OUT_DIR/handle_new_user_function.sql" 2>&1 || true

# Simpler, more robust approach: pg_get_functiondef reproduces the exact
# CREATE OR REPLACE statement directly — used for both functions and the
# trigger/event-trigger definitions below.
docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select pg_get_functiondef(oid) || ';' from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace;
" > "$OUT_DIR/handle_new_user_function.sql"

docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select pg_get_functiondef(oid) || ';' from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace;
" > "$OUT_DIR/rls_auto_enable_function.sql"

docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select 'drop trigger if exists on_auth_user_created on auth.users;' || chr(10) ||
       pg_get_triggerdef(oid) || ';'
from pg_trigger
where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal;
" > "$OUT_DIR/auth_users_trigger.sql"

docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select 'drop event trigger if exists rls_auto_enable_trigger;' || chr(10) ||
       'create event trigger rls_auto_enable_trigger on ddl_command_end when tag in (''CREATE TABLE'', ''CREATE TABLE AS'', ''SELECT INTO'') execute function public.rls_auto_enable();'
from pg_event_trigger where evtname = 'rls_auto_enable_trigger';
" > "$OUT_DIR/rls_auto_enable_event_trigger.sql"

docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select jsonb_pretty(jsonb_build_object(
  'schema_acl', (select nspacl::text from pg_namespace where nspname='public'),
  'default_privileges', (select jsonb_agg(jsonb_build_object('role', defaclrole::regrole::text, 'acl', defaclacl::text)) from pg_default_acl where defaclnamespace = 'public'::regnamespace),
  'table_grants', (select jsonb_agg(jsonb_build_object('grantee', grantee, 'table', table_name, 'priv', privilege_type)) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role'))
));
" > "$OUT_DIR/public_schema_acl.json"

sha256sum "$OUT_DIR"/handle_new_user_function.sql "$OUT_DIR"/rls_auto_enable_function.sql \
  "$OUT_DIR"/auth_users_trigger.sql "$OUT_DIR"/rls_auto_enable_event_trigger.sql \
  "$OUT_DIR"/public_schema_acl.json >> "$OUT_DIR/dump.sha256"

echo "Cross-schema artifacts written to $OUT_DIR"
