#!/usr/bin/env bash
# Pre-drop inventory snapshot for the Option A rehearsal. Local-stack only
# (uses the rehearsal's own `supabase_db_option-a-rehearsal` container via
# `docker exec` — never a remote connection string). Run before any DROP.
set -euo pipefail
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_option-a-rehearsal}"
OUT_DIR="${1:-./out}"
mkdir -p "$OUT_DIR"

docker exec -e PGPASSWORD=postgres "$CONTAINER" psql -U postgres -d postgres -At -c "
select jsonb_pretty(jsonb_build_object(
  'tables', (select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public'),
  'table_count', (select count(*) from pg_tables where schemaname='public'),
  'functions', (select jsonb_agg(proname order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'event_triggers', (select jsonb_agg(evtname) from pg_event_trigger),
  'auth_users_trigger_exists', (select count(*) > 0 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal),
  'policy_count', (select count(*) from pg_policies where schemaname='public'),
  'default_privileges_count', (select count(*) from pg_default_acl where defaclnamespace = 'public'::regnamespace)
));
" > "$OUT_DIR/pre-drop-inventory.json"

echo "Pre-drop inventory written to $OUT_DIR/pre-drop-inventory.json"
cat "$OUT_DIR/pre-drop-inventory.json"
