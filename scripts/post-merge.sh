#!/bin/bash
set -e
pnpm install --frozen-lockfile
# `pnpm --filter db push` removed (Product Data Scope Reset audit, see
# docs/... / plan history): this ran drizzle-kit push against whatever
# DATABASE_URL happens to be set in the environment on every merge, with
# no confirmation — a real risk of silently overwriting a live schema with
# the (at the time, empty/unvetted) lib/db schema. Migrations are now a
# deliberate, explicit, manual step — never an automatic postMerge side
# effect.
