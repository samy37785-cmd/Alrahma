#!/usr/bin/env bash
# Schema+data dump of the rehearsal's local `public`-relevant state, plus
# a checksum. Local-stack only. This is the ACTUAL pre-drop safety net
# the rehearsal proves works — not just a file that is assumed sufficient.
set -euo pipefail
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_option-a-rehearsal}"
OUT_DIR="${1:-./out}"
mkdir -p "$OUT_DIR"

# Full database dump (public + auth + storage + all Supabase-managed
# schemas) via pg_dump inside the container — captures the cross-schema
# auth.users trigger definition and the event trigger too, since both are
# database-level objects pg_dump includes by default.
docker exec -e PGPASSWORD=postgres "$CONTAINER" pg_dump -U postgres -d postgres \
  --no-owner > "$OUT_DIR/full_database.dump.sql"

# A second, narrower dump of just `public` — this is deliberately kept
# SEPARATE from the full dump above, because a full Supabase-managed
# database restore is not the same operation as restoring `public` alone
# (see docs/option-a-backup-restore.md).
docker exec -e PGPASSWORD=postgres "$CONTAINER" pg_dump -U postgres -d postgres \
  --schema=public --no-owner > "$OUT_DIR/public_schema_only.dump.sql"

sha256sum "$OUT_DIR/full_database.dump.sql" "$OUT_DIR/public_schema_only.dump.sql" > "$OUT_DIR/dump.sha256"

echo "Dumped to $OUT_DIR. Checksums:"
cat "$OUT_DIR/dump.sha256"
