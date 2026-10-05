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

export const PLAN_CATALOG_MISSING = 'PLAN_CATALOG_MISSING';

/**
 * Owner decision NO_MIGRATION_SERVICE_IDENTITY: the migration never
 * creates plans. create_plan_version() is is_admin_aal2()-gated, and the
 * only way the tool could call it was an automatic admin identity in
 * auth.users -- which is not allowed. The three canonical plans are
 * created beforehand through the normal admin flow; this only reads them.
 *
 * Returns slug -> id for every canonical plan with an active row. If any is
 * missing it throws an error whose `code` is PLAN_CATALOG_MISSING and
 * whose message names the required slugs only. Read-only: one SELECT.
 */
export async function requireCanonicalPlans(pgClient) {
  const slugs = CANONICAL_PLANS.map((p) => p.slug);
  const { rows } = await pgClient.query('SELECT slug, id FROM plans WHERE active = true AND slug = ANY($1::text[])', [slugs]);
  const slugToId = new Map(rows.map((r) => [r.slug, r.id]));
  const missing = slugs.filter((s) => !slugToId.has(s));
  if (missing.length > 0) {
    const err = new Error(
      `${PLAN_CATALOG_MISSING}: the migration needs these active plans to exist first: ${slugs.join(', ')} ` +
      `(missing: ${missing.join(', ')}). Create them through the admin flow; the migration never creates plans ` +
      'or an admin identity. Nothing was written.'
    );
    err.code = PLAN_CATALOG_MISSING;
    err.missing = missing;
    throw err;
  }
  return slugToId;
}
