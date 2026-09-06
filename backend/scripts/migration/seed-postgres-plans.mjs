#!/usr/bin/env node
// One-time LOCAL/rehearsal seed: creates the Starter/Standard/Premium plan
// rows via the real create_plan_version() RPC, matching the prices
// customers currently actually pay (backend/config/plans.js) so nothing is
// over/undercharged if the checkout flow is ever pointed at this data.
//
// create_plan_version() is is_admin_aal2()-gated. This script is an OFFLINE,
// human-run seed tool (not reachable from any HTTP route) connecting
// directly as the Postgres superuser — it manufactures a throwaway local
// admin identity purely to satisfy the RPC's own authorization check, the
// same way lib/db/test/local-harness.mjs manufactures roles/claims for its
// test suite. This is NOT the same thing as the live backend's
// withAdminAal2Context() (which always throws) — a human deliberately
// running this script IS the trusted actor; an anonymous HTTP request is
// not. Never call this script from application code.
import pg from 'pg';

function assertLocalHost(uri, label) {
  const host = new URL(uri).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

const PLANS = [
  { slug: 'Starter', name: 'Starter', amountMinor: 5600, currency: 'EUR' },
  { slug: 'Standard', name: 'Standard', amountMinor: 8400, currency: 'EUR' },
  { slug: 'Premium', name: 'Premium', amountMinor: 11200, currency: 'EUR' },
];

const SEED_ADMIN_ID = '00000000-0000-4000-8000-000000000001';

async function main() {
  const uri = process.env.MIGRATION_DB_URL;
  if (!uri) throw new Error('MIGRATION_DB_URL must be set (local-only).');
  assertLocalHost(uri, 'MIGRATION_DB_URL');

  const pool = new pg.Pool({ connectionString: uri });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Throwaway local admin identity, superuser-created, for this seed only.
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [SEED_ADMIN_ID, 'seed-admin@rehearsal.local']
    );
    await client.query(
      `INSERT INTO profiles (id, email, name, role) VALUES ($1, $2, 'Seed Admin', 'admin')
       ON CONFLICT (id) DO UPDATE SET role = 'admin'`,
      [SEED_ADMIN_ID, 'seed-admin@rehearsal.local']
    );

    await client.query('SET LOCAL ROLE authenticated');
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: SEED_ADMIN_ID, role: 'authenticated', aal: 'aal2' }),
    ]);

    for (const plan of PLANS) {
      const existing = await client.query(
        'SELECT id FROM plans WHERE slug = $1 AND active = true',
        [plan.slug]
      );
      if (existing.rows[0]) {
        console.log(`[seed-plans] ${plan.slug} already active (id=${existing.rows[0].id}), skipping`);
        continue;
      }
      const r = await client.query(
        `SELECT create_plan_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS id`,
        [null, plan.slug, plan.name, plan.amountMinor, plan.currency, 'monthly', null, null, null, null, null, 0]
      );
      console.log(`[seed-plans] created ${plan.slug} -> id=${r.rows[0].id}`);
    }

    await client.query('RESET ROLE');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed-plans] FATAL:', err.message);
  process.exitCode = 1;
});
