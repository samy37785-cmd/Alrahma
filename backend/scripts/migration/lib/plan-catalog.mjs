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
 * Full production cutover fix: a real dry-run preflight against a target
 * where the canonical plans have not been seeded yet used to ALWAYS report
 * every plan-bearing payments/enrollments row as failed ("does not resolve
 * to a known plan slug") — dry-run passed `null` for the whole
 * planSlugToId map (never running the real, write-performing
 * seedCanonicalPlans()), and `null?.has(slug)` is always falsy, so the
 * check `!ctx.planSlugToId?.has(slug)` was unconditionally true regardless
 * of whether the plan would actually resolve once --execute's own
 * seedCanonicalPlans() ran. This made dry-run a false-negative preflight
 * for these two domains specifically — the one thing production-import-
 * orchestrator.mjs's whole "fail closed via a real --dry-run BEFORE any
 * --execute write" design depends on being accurate.
 *
 * Read-only: never writes. For each canonical plan, uses the real active
 * row's id if one already exists (harmless SELECT), or a synthetic
 * placeholder UUID otherwise — dry-run only logs `wouldMigrate`/`would
 * upsert` messages with this id, it is never persisted, so a placeholder
 * is exactly as informative as a real one for what dry-run needs to prove:
 * "this row's plan WILL resolve once seedCanonicalPlans() actually runs
 * under --execute."
 */
export async function planSlugToIdForDryRun(pgClient) {
  const slugToId = new Map();
  for (const plan of CANONICAL_PLANS) {
    const existing = await pgClient.query('SELECT id FROM plans WHERE slug = $1 AND active = true', [plan.slug]);
    slugToId.set(plan.slug, existing.rows[0]?.id ?? `00000000-0000-4000-8000-dryrun00000${CANONICAL_PLANS.indexOf(plan)}`);
  }
  return slugToId;
}

/**
 * Seeds the canonical plan catalog via the real create_plan_version() RPC
 * (the only INSERT path plans.ts's RLS allows) — deterministic and
 * idempotent: a plan whose slug already has an active row is left alone.
 */
export async function seedCanonicalPlans(pgClient, { withImpersonatedAdmin }) {
  const slugToId = new Map();
  for (const plan of CANONICAL_PLANS) {
    const existing = await pgClient.query('SELECT id FROM plans WHERE slug = $1 AND active = true', [plan.slug]);
    if (existing.rows[0]) {
      slugToId.set(plan.slug, existing.rows[0].id);
      continue;
    }
    const id = await withImpersonatedAdmin(pgClient, async (client) => {
      const r = await client.query(
        `SELECT create_plan_version($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS id`,
        [null, plan.slug, plan.name, plan.amountMinor, plan.currency, plan.billingInterval, null, null, null, null, null, 0]
      );
      return r.rows[0].id;
    });
    slugToId.set(plan.slug, id);
  }
  return slugToId;
}
