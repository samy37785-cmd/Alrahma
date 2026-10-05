// SUPER_ADMIN_SAFETY_GATE: the only rows a production target may hold
// before the migration, besides rows the migration itself recorded in
// migration_source_ledger, are the ones the owner's real Super Admin
// bootstrap left behind -- and only when each of them is approved
// individually, by id and row fingerprint, in the signed approval
// manifest (`bootstrapAllowlist`). There is no wildcard and no "N rows
// allowed": every row is named, and anything else fails closed.
//
// What the bootstrap legitimately leaves (owner's later production order:
// real Super Admin -> one login -> MFA -> the 3 plans via the admin flow):
//   - auth.users: exactly one account, the approved Super Admin UUID;
//   - profiles: exactly one row, the same UUID, role 'admin';
//   - admin_role_assignments: exactly one 'super-admin' row, for that
//     UUID. Every other row must belong to a profile this migration
//     created and can never be 'super-admin' (the source admins stay
//     'admin');
//   - plans: exactly the three canonical plans (lib/plan-catalog.mjs),
//     identical to the catalog, active, each approved by id + fingerprint;
//   - admin_audit_log: exactly the approved rows, each written by the
//     Super Admin, each one of BOOTSTRAP_AUDIT_ACTIONS (its admin login /
//     MFA, and create_plan_version for an approved plan).
//
// Fingerprints are sha256 over a fixed set of columns read through
// to_jsonb(row) (a column the table lacks reads as null, so local stubs and
// the real GoTrue schema both work). They cover what identifies the row,
// not what changes in normal use (last sign-in, updated_at, the profile's
// display fields). The email is inside the hash and never leaves it: the
// allowlist holds UUIDs, slugs, action names and fingerprints only.
//
// Everything here is read-only: plain SELECTs.
import { stableContentHash } from './canonical-hash.mjs';
import { CANONICAL_PLANS } from './plan-catalog.mjs';

export const BOOTSTRAP_ALLOWLIST_SCHEMA_VERSION = 1;
export const SUPER_ADMIN_ROLE = 'super-admin';
export const BOOTSTRAP_STATE_REJECTED = 'BOOTSTRAP_STATE_REJECTED';
const SOURCE_DATABASE = 'al-rahma';

/** Audit actions the bootstrap may leave, with the resource_type each one writes. */
export const BOOTSTRAP_AUDIT_ACTIONS = Object.freeze({
  create_plan_version: 'plans',
  'auth.login_stage1': 'AdminAuth',
  'auth.login_success': 'AdminAuth',
  'auth.mfa_activated': 'AdminAuth',
  'auth.mfa_failed': 'AdminAuth',
  'auth.logout': 'AdminAuth',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;

export function rowFingerprint(source) {
  return `sha256:${stableContentHash(source)}`;
}

/** sha256 of the canonical allowlist -- what the manifest's confirmToken binds. */
export function bootstrapAllowlistSha256(allowlist) {
  return stableContentHash(allowlist);
}

function stateError(problems) {
  const err = new Error(
    `${BOOTSTRAP_STATE_REJECTED}: the target does not match the approved bootstrap allowlist exactly:\n  - ${problems.join('\n  - ')}`
  );
  err.code = BOOTSTRAP_STATE_REJECTED;
  err.problems = problems;
  return err;
}

// The same "recorded by this migration" predicate verifyNoUnrecordedData()
// uses. `targetTable` is always a literal from this file; $1 is the source
// database.
function ledgerAttributed(targetTable, idExpr) {
  return `exists (
    select 1 from public.migration_source_ledger l
    where l.target_table = '${targetTable}'
      and l.source_system = 'mongodb'
      and l.source_database = $1
      and btrim(l.source_collection) <> ''
      and btrim(l.source_document_id) <> ''
      and l.source_content_hash ~ '^[0-9a-f]{64}$'
      and l.status in ('created', 'reconciled', 'failed')
      and l.target_id is not null
      and l.target_id = ${idExpr}
  )`;
}

/** Reads every row the allowlist rules look at. Plain SELECTs only. */
export async function readBootstrapState(pgClient) {
  const rows = async (sql, params = [SOURCE_DATABASE]) => (await pgClient.query(sql, params)).rows;
  const authUsers = await rows(`
    select u.id::text as id,
           jsonb_build_object(
             'id', u.id, 'email', lower(to_jsonb(u)->>'email'), 'aud', to_jsonb(u)->'aud', 'role', to_jsonb(u)->'role',
             'created_at', to_jsonb(u)->'created_at', 'email_confirmed_at', to_jsonb(u)->'email_confirmed_at',
             'banned_until', to_jsonb(u)->'banned_until', 'deleted_at', to_jsonb(u)->'deleted_at',
             'is_sso_user', to_jsonb(u)->'is_sso_user', 'is_anonymous', to_jsonb(u)->'is_anonymous'
           ) as src
      from auth.users u
     where not exists (select 1 from public.profiles p where p.id = u.id and ${ledgerAttributed('profiles', 'u.id::text')})
     order by u.id`);
  const profiles = await rows(`
    select p.id::text as id, p.role::text as role,
           jsonb_build_object('id', p.id, 'email', lower(p.email), 'role', p.role, 'created_at', p.created_at) as src
      from public.profiles p
     where not ${ledgerAttributed('profiles', 'p.id::text')}
     order by p.id`);
  const roleAssignments = await rows(`
    select a.user_id::text as user_id, a.role::text as role,
           ${ledgerAttributed('profiles', 'a.user_id::text')} as migrated,
           jsonb_build_object('user_id', a.user_id, 'role', a.role, 'assigned_by', a.assigned_by, 'assigned_at', a.assigned_at) as src
      from public.admin_role_assignments a
     order by a.user_id`);
  const plans = await rows(`
    select p.id::text as id, p.slug, p.name, p.amount_minor, p.currency::text as currency, p.billing_interval, p.active,
           to_jsonb(p) - 'updated_at' as src
      from public.plans p
     order by p.slug, p.id`, []);
  const auditRows = await rows(`
    select a.id::text as id, a.actor_admin_id::text as actor, a.action, a.resource_type, a.resource_id, to_jsonb(a) as src
      from public.admin_audit_log a
     where not ${ledgerAttributed('admin_audit_log', 'a.id::text')}
     order by a.created_at, a.id`);
  const fp = (list) => list.map(({ src, ...rest }) => ({ ...rest, fingerprint: rowFingerprint(src) }));
  return {
    authUsers: fp(authUsers),
    profiles: fp(profiles),
    roleAssignments: fp(roleAssignments),
    plans: fp(plans),
    auditRows: fp(auditRows),
  };
}

/** Every canonical slug has an active row (the workers' PLAN_CATALOG_MISSING condition, inverted). */
export function canonicalCatalogComplete(plans) {
  return CANONICAL_PLANS.every((c) => plans.some((p) => p.slug === c.slug && p.active === true));
}

function catalogMismatch(plan) {
  const expected = CANONICAL_PLANS.find((p) => p.slug === plan.slug);
  if (!expected) return 'is not a canonical plan slug';
  const diffs = [];
  if (plan.name !== expected.name) diffs.push('name');
  if (Number(plan.amount_minor) !== expected.amountMinor) diffs.push('amount_minor');
  if (plan.currency !== expected.currency) diffs.push('currency');
  if (plan.billing_interval !== expected.billingInterval) diffs.push('billing_interval');
  if (plan.active !== true) diffs.push('active');
  return diffs.length ? `differs from the catalog in ${diffs.join(', ')}` : null;
}

/**
 * Every way `state` differs from what `allowlist` approves (an empty list
 * means an exact match). `allowlist` null means nothing is approved: no
 * non-migrated identity, role, audit row may exist; plans, if any exist,
 * must still be exactly the canonical three.
 *
 * While the canonical catalog is incomplete (a canonical plan missing or
 * inactive) the plans are left to the workers, which stop with
 * PLAN_CATALOG_MISSING before any write (NO_MIGRATION_SERVICE_IDENTITY);
 * an incomplete catalog can therefore never get past the plan step.
 */
export function compareBootstrapState(state, allowlist) {
  const problems = [];
  const admin = allowlist?.superAdmin ?? null;
  const adminId = admin?.userId ?? null;

  // auth.users / profiles: exactly the approved account, nothing else.
  for (const [table, rowsOf, fpKey] of [['auth.users', state.authUsers, 'authUserFingerprint'], ['profiles', state.profiles, 'profileFingerprint']]) {
    const extra = rowsOf.filter((r) => r.id !== adminId);
    if (extra.length > 0) {
      problems.push(`${table}: ${extra.length} row(s) not created by this migration and not the approved Super Admin (${extra.map((r) => r.id).join(', ')})`);
    }
    if (adminId) {
      const row = rowsOf.find((r) => r.id === adminId);
      if (!row) problems.push(`${table}: the approved Super Admin ${adminId} is missing`);
      else if (row.fingerprint !== admin[fpKey]) problems.push(`${table}: the approved Super Admin ${adminId} no longer matches its approved fingerprint`);
      if (row && table === 'profiles' && row.role !== 'admin') problems.push(`profiles: the approved Super Admin ${adminId} has role "${row.role}", expected "admin"`);
    }
  }

  // admin_role_assignments: one super-admin, the approved one; migrated admins never super-admin.
  const superAdmins = state.roleAssignments.filter((r) => r.role === SUPER_ADMIN_ROLE);
  for (const r of state.roleAssignments) {
    if (r.user_id === adminId) {
      if (r.role !== SUPER_ADMIN_ROLE) problems.push(`admin_role_assignments: the approved Super Admin ${adminId} has role "${r.role}", expected "${SUPER_ADMIN_ROLE}"`);
      else if (r.fingerprint !== admin.roleAssignmentFingerprint) problems.push(`admin_role_assignments: the approved Super Admin's role row no longer matches its approved fingerprint`);
    } else if (!r.migrated) {
      problems.push(`admin_role_assignments: a "${r.role}" role for ${r.user_id}, which is neither a migrated account nor the approved Super Admin`);
    } else if (r.role === SUPER_ADMIN_ROLE) {
      problems.push(`admin_role_assignments: migrated account ${r.user_id} holds "${SUPER_ADMIN_ROLE}"; migrated admins stay "admin"`);
    }
  }
  if (adminId && !state.roleAssignments.some((r) => r.user_id === adminId)) {
    problems.push(`admin_role_assignments: the approved Super Admin ${adminId} has no role row`);
  }
  if (superAdmins.length > (adminId ? 1 : 0)) {
    problems.push(`admin_role_assignments: ${superAdmins.length} "${SUPER_ADMIN_ROLE}" row(s); exactly ${adminId ? 1 : 0} may exist`);
  }

  // plans: exactly the canonical three, identical to the catalog (and approved, when there is an allowlist).
  const approvedPlans = allowlist?.plans ?? null;
  if (canonicalCatalogComplete(state.plans) && (state.plans.length > 0 || approvedPlans)) {
    if (state.plans.length !== CANONICAL_PLANS.length) {
      problems.push(`plans: ${state.plans.length} row(s); exactly ${CANONICAL_PLANS.length} (${CANONICAL_PLANS.map((p) => p.slug).join(', ')}) may exist`);
    }
    for (const p of state.plans) {
      const mismatch = catalogMismatch(p);
      if (mismatch) problems.push(`plans: ${p.id} (${p.slug}) ${mismatch}`);
    }
    for (const slug of CANONICAL_PLANS.map((p) => p.slug)) {
      if (state.plans.filter((p) => p.slug === slug).length !== 1) problems.push(`plans: expected exactly one "${slug}" row`);
    }
    if (approvedPlans) {
      for (const approved of approvedPlans) {
        const row = state.plans.find((p) => p.id === approved.id);
        if (!row) problems.push(`plans: the approved plan ${approved.id} (${approved.slug}) is missing`);
        else if (row.slug !== approved.slug) problems.push(`plans: ${approved.id} has slug "${row.slug}", approved as "${approved.slug}"`);
        else if (row.fingerprint !== approved.fingerprint) problems.push(`plans: ${approved.id} (${approved.slug}) no longer matches its approved fingerprint`);
      }
      for (const row of state.plans) {
        if (!approvedPlans.some((a) => a.id === row.id)) problems.push(`plans: ${row.id} (${row.slug}) is not an approved plan`);
      }
    }
  }

  // admin_audit_log: exactly the approved rows, each a bootstrap action by the Super Admin.
  const approvedAudit = allowlist?.auditRows ?? [];
  const planIds = new Set((approvedPlans ?? []).map((p) => p.id));
  const planAuditCount = new Map();
  for (const row of state.auditRows) {
    const approved = approvedAudit.find((a) => a.id === row.id);
    if (!approved) {
      problems.push(`admin_audit_log: row ${row.id} ("${row.action}") is not in the approved allowlist`);
      continue;
    }
    if (row.fingerprint !== approved.fingerprint) problems.push(`admin_audit_log: row ${row.id} no longer matches its approved fingerprint`);
    if (row.action !== approved.action) problems.push(`admin_audit_log: row ${row.id} has action "${row.action}", approved as "${approved.action}"`);
    if (!adminId || row.actor !== adminId) problems.push(`admin_audit_log: row ${row.id} was not written by the approved Super Admin`);
    const resourceType = BOOTSTRAP_AUDIT_ACTIONS[row.action];
    if (!resourceType) problems.push(`admin_audit_log: row ${row.id} action "${row.action}" is not a bootstrap action`);
    else if (row.resource_type !== resourceType) problems.push(`admin_audit_log: row ${row.id} has resource_type "${row.resource_type}", expected "${resourceType}"`);
    if (row.action === 'create_plan_version') {
      if (!planIds.has(row.resource_id)) problems.push(`admin_audit_log: row ${row.id} records a plan that is not an approved plan`);
      planAuditCount.set(row.resource_id, (planAuditCount.get(row.resource_id) ?? 0) + 1);
    }
  }
  for (const approved of approvedAudit) {
    if (!state.auditRows.some((r) => r.id === approved.id)) problems.push(`admin_audit_log: the approved row ${approved.id} is missing`);
  }
  for (const [planId, n] of planAuditCount) {
    if (n > 1) problems.push(`admin_audit_log: ${n} create_plan_version rows for plan ${planId}; at most one is a bootstrap creation`);
  }

  return problems;
}

/** Throws (BOOTSTRAP_STATE_REJECTED) unless the target matches `allowlist` exactly; returns a PII-free summary. */
export async function verifyBootstrapState(pgClient, allowlist) {
  if (allowlist !== null && allowlist !== undefined) validateBootstrapAllowlist(allowlist);
  const state = await readBootstrapState(pgClient);
  const problems = compareBootstrapState(state, allowlist ?? null);
  if (problems.length > 0) throw stateError(problems);
  return summarizeBootstrapState(state, allowlist ?? null);
}

export function summarizeBootstrapState(state, allowlist) {
  return {
    allowlistPresent: !!allowlist,
    superAdmin: { preExisting: state.authUsers.length, approved: !!allowlist?.superAdmin && state.authUsers.length === 1 },
    plans: { count: state.plans.length, catalogComplete: canonicalCatalogComplete(state.plans), matchCatalog: state.plans.length === CANONICAL_PLANS.length && state.plans.every((p) => !catalogMismatch(p)), approved: !!allowlist?.plans },
    auditRows: { preExisting: state.auditRows.length, approved: (allowlist?.auditRows ?? []).length },
    roleAssignments: { superAdmin: state.roleAssignments.filter((r) => r.role === SUPER_ADMIN_ROLE).length, migrated: state.roleAssignments.filter((r) => r.migrated).length },
  };
}

/**
 * Builds the allowlist that approves exactly what the target holds now
 * (for the owner's unsigned manifest candidate). Refuses, with the same
 * problems verifyBootstrapState() would report, when the target holds
 * anything a bootstrap cannot legitimately leave.
 */
export async function collectBootstrapAllowlist(pgClient, { requireSuperAdmin = true } = {}) {
  const state = await readBootstrapState(pgClient);
  const problems = [];
  if (state.authUsers.length > 1 || (requireSuperAdmin && state.authUsers.length !== 1)) {
    problems.push(`auth.users: ${state.authUsers.length} account(s) not created by this migration; a bootstrap leaves exactly 1 (the Super Admin)`);
  }
  if (!canonicalCatalogComplete(state.plans)) problems.push(`plans: the ${CANONICAL_PLANS.length} canonical plans must exist, active, before the allowlist is collected`);
  const admin = state.authUsers.length === 1 ? state.authUsers[0] : null;
  const profile = admin && state.profiles.find((p) => p.id === admin.id);
  const role = admin && state.roleAssignments.find((r) => r.user_id === admin.id);
  if (admin && !profile) problems.push(`profiles: the Super Admin ${admin.id} has no profile`);
  if (admin && !role) problems.push(`admin_role_assignments: the Super Admin ${admin.id} has no role row`);
  if (problems.length > 0) throw stateError(problems);

  const allowlist = {
    schemaVersion: BOOTSTRAP_ALLOWLIST_SCHEMA_VERSION,
    superAdmin: admin ? {
      userId: admin.id,
      authUserFingerprint: admin.fingerprint,
      profileFingerprint: profile.fingerprint,
      roleAssignmentFingerprint: role.fingerprint,
    } : null,
    plans: CANONICAL_PLANS.map((c) => state.plans.find((p) => p.slug === c.slug))
      .filter(Boolean)
      .map((p) => ({ id: p.id, slug: p.slug, fingerprint: p.fingerprint })),
    auditRows: state.auditRows.map((a) => ({ id: a.id, action: a.action, fingerprint: a.fingerprint })),
  };
  const mismatches = compareBootstrapState(state, allowlist);
  if (mismatches.length > 0) throw stateError(mismatches);
  validateBootstrapAllowlist(allowlist);
  return { allowlist, summary: summarizeBootstrapState(state, allowlist) };
}

/**
 * Strict shape check of a manifest's bootstrapAllowlist: exact keys, real
 * UUIDs and fingerprints, the three canonical slugs, known audit actions,
 * no duplicates. Anything else (a wildcard, a count, an extra key) throws.
 */
export function validateBootstrapAllowlist(allowlist) {
  const fail = (msg) => { throw new Error(`bootstrapAllowlist: ${msg}`); };
  const exactKeys = (obj, keys, where) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail(`${where} must be an object`);
    const got = Object.keys(obj).sort();
    if (JSON.stringify(got) !== JSON.stringify([...keys].sort())) fail(`${where} must have exactly the keys ${keys.join(', ')} (got ${got.join(', ')})`);
  };
  exactKeys(allowlist, ['schemaVersion', 'superAdmin', 'plans', 'auditRows'], 'the allowlist');
  if (allowlist.schemaVersion !== BOOTSTRAP_ALLOWLIST_SCHEMA_VERSION) fail(`schemaVersion must be ${BOOTSTRAP_ALLOWLIST_SCHEMA_VERSION}`);
  if (allowlist.superAdmin !== null) {
    exactKeys(allowlist.superAdmin, ['userId', 'authUserFingerprint', 'profileFingerprint', 'roleAssignmentFingerprint'], 'superAdmin');
    if (!UUID_RE.test(allowlist.superAdmin.userId)) fail('superAdmin.userId must be a lowercase UUID');
    for (const k of ['authUserFingerprint', 'profileFingerprint', 'roleAssignmentFingerprint']) {
      if (!FINGERPRINT_RE.test(allowlist.superAdmin[k])) fail(`superAdmin.${k} must be sha256:<64 hex>`);
    }
  }
  if (!Array.isArray(allowlist.plans) || allowlist.plans.length !== CANONICAL_PLANS.length) fail(`plans must list exactly the ${CANONICAL_PLANS.length} canonical plans`);
  const slugs = new Set();
  const ids = new Set();
  for (const p of allowlist.plans) {
    exactKeys(p, ['id', 'slug', 'fingerprint'], 'each plan');
    if (!UUID_RE.test(p.id)) fail('a plan id is not a lowercase UUID');
    if (!CANONICAL_PLANS.some((c) => c.slug === p.slug)) fail(`plan slug "${p.slug}" is not canonical`);
    if (!FINGERPRINT_RE.test(p.fingerprint)) fail('a plan fingerprint is not sha256:<64 hex>');
    if (slugs.has(p.slug) || ids.has(p.id)) fail('plans contain a duplicate');
    slugs.add(p.slug);
    ids.add(p.id);
  }
  if (!Array.isArray(allowlist.auditRows)) fail('auditRows must be an array');
  if (allowlist.superAdmin === null && allowlist.auditRows.length > 0) fail('auditRows must be empty when no Super Admin is approved');
  const auditIds = new Set();
  for (const a of allowlist.auditRows) {
    exactKeys(a, ['id', 'action', 'fingerprint'], 'each audit row');
    if (!UUID_RE.test(a.id)) fail('an audit row id is not a lowercase UUID');
    if (!Object.hasOwn(BOOTSTRAP_AUDIT_ACTIONS, a.action)) fail(`audit action "${a.action}" is not a bootstrap action`);
    if (!FINGERPRINT_RE.test(a.fingerprint)) fail('an audit row fingerprint is not sha256:<64 hex>');
    if (auditIds.has(a.id)) fail('auditRows contain a duplicate');
    auditIds.add(a.id);
  }
  return true;
}

/** The ids verifyNoUnrecordedData() may skip once verifyBootstrapState() has passed. */
export function approvedBootstrapIds(allowlist) {
  const adminId = allowlist?.superAdmin?.userId;
  return {
    users: adminId ? [adminId] : [],
    auditRows: (allowlist?.auditRows ?? []).map((a) => a.id),
  };
}
