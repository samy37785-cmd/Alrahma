// Stage 2J-B — the ONE real source of plan identity, taken directly from
// backend/config/plans.js (the live checkout flow's own server-side
// price truth) — never invented at migration time. Amounts here are
// EUR minor units (cents), matching backend/config/plans.js's own
// documented monthly amounts (56/84/112) exactly.
export const CANONICAL_PLANS = [
  { slug: 'Starter', name: 'Starter', amountMinor: 5600, currency: 'EUR', billingInterval: 'month' },
  { slug: 'Standard', name: 'Standard', amountMinor: 8400, currency: 'EUR', billingInterval: 'month' },
  { slug: 'Premium', name: 'Premium', amountMinor: 11200, currency: 'EUR', billingInterval: 'month' },
];

const PLAN_NAME_TO_SLUG = new Map(CANONICAL_PLANS.map((p) => [p.name.toLowerCase(), p.slug]));

/**
 * Resolves a free-text Mongo plan name (Payment.plan / User.subscription.plan)
 * to a canonical plan slug. Returns null (never a guess/default) if the
 * name doesn't match any known plan — callers must treat null as a FAIL,
 * not silently proceed with an unresolved plan reference.
 */
export function resolvePlanSlug(mongoPlanName) {
  if (!mongoPlanName) return null;
  const key = String(mongoPlanName).trim().toLowerCase();
  return PLAN_NAME_TO_SLUG.get(key) ?? null;
}

/**
 * Seeds the canonical plan catalog via the real create_plan_version() RPC
 * (the only INSERT path plans.ts's RLS allows) — deterministic and
 * idempotent: a plan whose slug already has an active row is left alone.
 * `ensureSeedAdmin`, when given, runs once before the first plan that
 * actually has to be created, so a target whose catalog is already
 * complete never gets the migration seed-admin identity at all.
 */
export async function seedCanonicalPlans(pgClient, { withImpersonatedAdmin, ensureSeedAdmin }) {
  const slugToId = new Map();
  let seedAdminReady = false;
  for (const plan of CANONICAL_PLANS) {
    const existing = await pgClient.query('SELECT id FROM plans WHERE slug = $1 AND active = true', [plan.slug]);
    if (existing.rows[0]) {
      slugToId.set(plan.slug, existing.rows[0].id);
      continue;
    }
    if (ensureSeedAdmin && !seedAdminReady) {
      await ensureSeedAdmin();
      seedAdminReady = true;
    }
    const id = await withImpersonatedAdmin(pgClient, async (client) => {
      // create_plan_version() returns a whole public.plans row; pg has no
      // parser for that composite type and would hand back its text form,
      // so the id is extracted in SQL (same fix as invoices' upsert).
      const r = await client.query(
        `SELECT (create_plan_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)).id AS id`,
        [null, plan.slug, plan.name, plan.amountMinor, plan.currency, plan.billingInterval, null, null, null, null, null, 0]
      );
      return r.rows[0].id;
    });
    slugToId.set(plan.slug, id);
  }
  return slugToId;
}

/**
 * Plan mode's read-only view of the same catalog: the real id of each
 * canonical plan that already has an active row, and a deterministic
 * planned id (lib/planned-ids.mjs) for each one a real run would create.
 * Never writes.
 */
export async function readCanonicalPlanIds(pgClient, { plannedIdFor }) {
  const slugToId = new Map();
  for (const plan of CANONICAL_PLANS) {
    const existing = await pgClient.query('SELECT id FROM plans WHERE slug = $1 AND active = true', [plan.slug]);
    slugToId.set(plan.slug, existing.rows[0]?.id ?? plannedIdFor(plan.slug));
  }
  return slugToId;
}
