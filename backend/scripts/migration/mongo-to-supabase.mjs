#!/usr/bin/env node
// Stage 2E migration tooling — Mongo -> Supabase, for the matched domains
// only (see docs/option-a-mongo-supabase-parity-map.md). NEVER run this
// against the real production MongoDB or the real Supabase project
// (difzynyphojgisrfvrkd) — both connection strings are hard-checked below to
// be localhost/127.0.0.1 only, exactly like lib/db/test/local-harness.mjs's
// assertLocalHost() guard.
//
// This is an OFFLINE, human-run batch tool — it connects to Postgres as the
// superuser (whatever MIGRATION_DB_URL's role is, typically `postgres`),
// not through client.js's RLS-impersonating pool. That's a deliberate and
// safe distinction from the live backend: client.js's withAdminAal2Context()
// always throws because the live backend has no way to prove an incoming
// HTTP request is really from an MFA'd admin — but a human operator running
// this script directly (`node mongo-to-supabase.mjs`) IS the trusted actor,
// the same way lib/db's own local-harness.mjs manufactures local roles/
// claims for its test suite. This distinction must never be blurred: this
// script must never be reachable from an HTTP route.
//
// Usage:
//   node mongo-to-supabase.mjs --domain=<name>|all [--exclude-domain=<name>[,<name>...]] [--dry-run] [--reset-checkpoint]
//   node mongo-to-supabase.mjs --domain=<name>|all --rollback
//
// --rollback deletes exactly the Postgres rows this tool's own checkpoint
// says it created/touched for that domain (Mongo is never contacted), then
// clears the checkpoint so a later forward run starts clean.
//
// Safety properties:
//   - Idempotent: re-running is always safe. A local checkpoint file
//     (.checkpoints/<domain>.json) maps each Mongo _id to the Postgres row
//     it produced (if any) and a content hash; unchanged records are
//     skipped, changed ones are re-upserted, nothing is ever duplicated.
//   - Resumable: if interrupted mid-run, the checkpoint file already has
//     everything processed so far — re-running continues where it left off.
//   - No PII/secrets in logs: only counts, ids, and hashes are printed —
//     never email/name/message/note content.
//   - Dry-run: --dry-run performs the export/transform/validate/hash steps
//     and prints exactly what WOULD be imported, without writing anything.
//
// Stage 2J-B Part H fixes (both found on a REAL local rehearsal against
// the actual validated dump, not by inspection):
//   1. lib/source-ledger.mjs's markPlanned() had `targetTable` and
//      `contentHash` swapped in its INSERT params relative to the named
//      column list -- every ledger row got a content hash stored in
//      target_table and a table name stored in source_content_hash. This
//      silently broke findLedgerEntry()'s matching, so the DB-side
//      duplicate-import guard (built specifically to protect a resume
//      "after the checkpoint file was lost, or from a different machine")
//      never actually fired. Fixed; re-verified via a full reset -> real
//      import -> idempotent-rerun -> simulated-checkpoint-loss cycle.
//   2. rollbackDomain() deleted target-table rows and cleared the LOCAL
//      checkpoint file, but never touched migration_source_ledger -- a
//      stale 'reconciled' ledger row (still pointing at a pgId rollback
//      had just deleted) made a subsequent forward run report "unchanged"
//      and skip re-creating the row, so the data never came back. Fixed:
//      rollback now clears this domain's ledger rows unconditionally,
//      even when the local checkpoint is already empty (the ledger can be
//      stale on its own). Re-verified: rollback -> forward-migrate now
//      correctly restores every row.
//   3. This process's own exit code previously stayed 0 even when a
//      domain's documents genuinely failed transform/validate (only an
//      uncaught top-level exception set a non-zero exit) -- confirmed for
//      real: --domain=payments against the actual dump reported
//      "failed=15" for all 15 real payment records (gateway "paymob" is
//      not supported by this adapter) yet exited 0, which would have let
//      a caller checking only the exit code (exactly what
//      production-import-orchestrator.mjs does) silently treat total data
//      loss as success. Any domain with failed > 0 now sets a non-zero
//      exit code.
//   4. New --exclude-domain=<name>[,<name>...] (valid only with
//      --domain=all) lets a caller run "every domain except N" without
//      enumerating every other domain by hand -- used by the production
//      orchestrator's explicit DEFERRED_DOMAINS policy (payments is
//      DEFERRED_BY_PRODUCT_DECISION this round: not migrated, not
//      modified, original Mongo data untouched).
//
// Review round 3 (PR #70, second review pass -- four further fixes, all
// found by re-reading round 2's own new code, not by inspection alone):
//   5. rollbackDomain()'s missing-checkpoint ledger fallback only matched
//      status IN ('created', 'reconciled') -- but kill-window 3 (a crash
//      between markCreated and markReconciled) leaves a row at
//      status='failed' (the outer per-document catch always calls
//      markFailed(), even for an injected fault -- see migrateDomain()'s
//      own comment) with target_id STILL SET, since markFailed() never
//      touches target_id. That row was invisible to the fallback query,
//      so a rollback with a lost checkpoint after exactly that crash left
//      the row permanently orphaned -- no checkpoint entry, no ledger
//      entry, the row itself still physically present. Fixed: the
//      fallback now also matches status='failed' rows that have a
//      target_id, since a failure AFTER the target write genuinely did
//      leave a real row behind, unlike a failure before it.
//   6. rollbackDomain() deleted the target row, then unconditionally
//      deleted its ledger row and COMMITted, and only checked whether the
//      row actually still existed AFTER the commit was already durable.
//      A DELETE that reports success (or reports 0 rows affected because
//      a BEFORE DELETE trigger silently vetoed it -- a real, legal
//      Postgres behavior, not a hypothetical) was trusted blindly at
//      exactly the moment that mattered: the ledger row was already gone
//      by the time anyone checked. Fixed: verifyTargetRowExists() now
//      runs INSIDE the transaction, after the DELETE but BEFORE the
//      ledger-row DELETE and BEFORE COMMIT -- if the row is still there,
//      this throws before either of those happens, so ROLLBACK discards
//      everything and BOTH the target row and its ledger row survive
//      intact, exactly as if rollback for that row had never run. The
//      post-commit re-check from round 2 stays in place too, as a second,
//      independent confirmation once the transaction IS durable.
//   7. migrateDomain()'s resumeTargetId (the existing target row a resume
//      must reuse rather than re-INSERT) was only ever honored by domains
//      whose upsert() happened to read checkpoint[sourceId]?.pgId --
//      an unenforced convention most domains follow (via a natural unique
//      constraint's ON CONFLICT, or an explicit checkpoint check) but two
//      plain-INSERT domains with no natural dedup key did not:
//      notifications and system_audit_logs (admin_audit_log). A resume
//      after a crash between markCreated and markReconciled for either
//      of those would have silently INSERTed a second, orphaned row.
//      Fixed two ways: (a) both domains' upsert() now honor
//      checkpoint[sourceId]?.pgId like every other non-natural-key
//      domain (admin_audit_log additionally never attempts an UPDATE on
//      reuse -- forbid_audit_log_mutation() blocks UPDATE for every role,
//      and an audit log's content cannot legitimately change anyway, so
//      reusing the id with zero writes is the only correct action); and
//      (b) resumeTargetId is now a STRUCTURALLY ENFORCED contract, not
//      just a fixed convention -- migrateDomain() itself now verifies,
//      for every domain, that a known resumeTargetId was actually reused
//      (the id upsert() returns must equal it); any domain -- this one or
//      a future one -- that ignores it and inserts a fresh row anyway is
//      caught HERE, before COMMIT, and the whole transaction (including
//      that erroneous INSERT) is rolled back rather than ever landing a
//      silent duplicate.
//   8. production-import-orchestrator.mjs's runImport() ran
//      users_and_relationships for REAL (--execute) before the domain
//      dry-run preflight even happened -- see that file's own changelog.
import pg from 'pg';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLedgerEntry, markPlanned, markCreated, markFailed, contentHashOf } from './lib/source-ledger.mjs';
import { stableContentHash } from './lib/canonical-hash.mjs';
import { verifyThenReconcile } from './lib/reconcile.mjs';
import { resolvePlanSlug, seedCanonicalPlans } from './lib/plan-catalog.mjs';
import { withImpersonatedAdmin, withImpersonatedAdminContext, ensureMigrationSeedAdmin } from './lib/admin-rpc.mjs';
import { throwIfFaultStage } from './lib/fault-injection.mjs';
import { parseStrictCliArgs } from './lib/cli-args.mjs';
import { encodeCompositeTargetId, decodeCompositeTargetId } from './lib/composite-target-id.mjs';
import { verifyReadBack } from './lib/read-back-verify.mjs';
import { assertLocalHostOrProductionAuthorized } from './lib/host-guard.mjs';
import { loadAndVerifyProductionAuthorization } from './lib/production-authorization.mjs';

// Stage 2J-B, PR #70 review round 8, item 1 -- this script's own CLI was
// still parsed by hand (a generic --key=value splitter, `v ?? true`) even
// after round 7 moved BOTH other entrypoints to the shared strict parser.
// The exact same truthy-string class of bug applied here too:
// `--rollback=false`/`--reset-checkpoint=false` parsed to the STRING
// "false", coerced truthy by `!!`, silently enabling the flag; an unknown
// or misspelled flag (e.g. --domian) was simply ignored rather than
// rejected. Fixed by adopting the same allowlisted, boolean-flags-bare-
// only parser used by the other two entrypoints -- see lib/cli-args.mjs's
// own header for the full rationale.
export const CLI_SPEC = {
  flags: {
    domain: { type: 'string' },
    'exclude-domain': { type: 'string' },
    'dry-run': { type: 'boolean' },
    'reset-checkpoint': { type: 'boolean' },
    rollback: { type: 'boolean' },
  },
};

// Cross-flag validation the shared parser deliberately does not attempt
// (it only knows about individual flags, not their relationships to each
// other) -- runs immediately after parseStrictCliArgs, still before any
// env var read or DB/network connection. rollbackDomain() never reads
// dryRun or resetCheckpoint at all (see its own definition): passing
// either alongside --rollback was previously silently ignored, which is
// exactly the kind of "operator believed X, tool silently did Y" footgun
// this round exists to close -- `--rollback --dry-run` looked like a safe
// preview but actually performed real deletes.
export function validateCliArgs(args) {
  if (args.rollback && args['dry-run']) {
    throw new Error(
      '--rollback and --dry-run cannot be combined -- rollback always performs real deletes ' +
      '(there is no dry-run preview mode for it); pass one or the other.'
    );
  }
  if (args.rollback && args['reset-checkpoint']) {
    throw new Error(
      '--rollback and --reset-checkpoint cannot be combined -- rollback already clears this ' +
      "domain's checkpoint entries for every row it verifies deleted as part of its own " +
      'contract; --reset-checkpoint has no meaning during a rollback run.'
    );
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_DIR = path.join(__dirname, '.checkpoints');
const OUT_DIR = path.join(__dirname, 'out');
// Stage 2J-B: the source database name is fixed and explicit, never
// inferred from the connection string — every ledger row is tagged with
// it so a future second source database can never collide silently.
const SOURCE_DATABASE = 'al-rahma';

function assertLocalHost(connectionString, label) {
  const host = new URL(connectionString).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

// PR #70 review round 11, item 3: the local checkpoint's own display hash
// now shares the exact same canonical, generated-field-excluding
// representation as the DB ledger's `fullHash` below (lib/canonical-hash.mjs)
// -- purely for consistency between the two; this value is never compared
// against anything (informational bookkeeping only), but there is no reason
// for it to be derived differently, or to remain sensitive to a generated
// fallback's inherently unstable value, when the ledger hash right next to
// it is not.
function hashOf(obj) {
  return stableContentHash(obj).slice(0, 16);
}

function loadCheckpoint(domain) {
  const file = path.join(CHECKPOINT_DIR, `${domain}.json`);
  if (fs.existsSync(file)) return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  return { file, data: {} };
}

function saveCheckpoint(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Cross-domain FK resolution (Stage 2F: the 12 new domains, unlike
// Stage 2E's 3, reference users/courses by id) ---
//
// courses: this tool migrates courses itself, so a dependent domain's
// Mongo course _id resolves to a Postgres uuid via the courses domain's OWN
// checkpoint file (mongoId -> pgId), loaded on demand.
//
// users: there is no "users" migration domain at all — Mongo User accounts
// become Supabase Auth accounts through real sign-up (or a separate,
// harder, not-yet-built admin.createUser-based migration), never through a
// direct table insert here. The only reliable bridge between "this Mongo
// ObjectId" and "that profiles.id" for an ALREADY-migrated account is a
// matching email — loaded once into memory (never logged) and used to
// resolve every user reference below. A referenced user with no matching
// profiles row (not yet migrated/signed-up under Supabase) is a genuine,
// expected skip, not a bug — reported via the normal `failed` counter with
// a clear reason string, same as any other unresolvable row.
const courseIdCache = new Map(); // domainName -> {mongoId: pgId}
function resolveCoursePgId(mongoCourseId) {
  if (!mongoCourseId) return null;
  if (!courseIdCache.has('courses')) {
    const { data } = loadCheckpoint('courses');
    courseIdCache.set('courses', Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.pgId])));
  }
  const map = courseIdCache.get('courses');
  const pgId = map[String(mongoCourseId)];
  if (!pgId) throw new Error(`course ${mongoCourseId} has not been migrated yet — run --domain=courses first`);
  return pgId;
}

let userEmailMapPromise;
async function loadUserEmailMap() {
  if (!userEmailMapPromise) {
    userEmailMapPromise = (async () => {
      const User = mongoose.connection.collection('users');
      const users = await User.find({}, { projection: { email: 1 } }).toArray();
      return new Map(users.map((u) => [String(u._id), String(u.email).toLowerCase()]));
    })();
  }
  return userEmailMapPromise;
}

// Stage 2J-B — admin_audit_log.actor_admin_id resolution. Mongo
// SystemAuditLog.adminId refs the `adminusers` collection specifically
// (not `users`) — a real AdminUser account, resolved the same
// email-bridge way resolveProfileId() resolves a `users` reference.
let adminEmailMapPromise;
async function loadAdminEmailMap() {
  if (!adminEmailMapPromise) {
    adminEmailMapPromise = (async () => {
      const AdminUser = mongoose.connection.collection('adminusers');
      const admins = await AdminUser.find({}, { projection: { email: 1 } }).toArray();
      return new Map(admins.map((a) => [String(a._id), String(a.email).toLowerCase()]));
    })();
  }
  return adminEmailMapPromise;
}
async function resolveAdminProfileId(pgClient, adminEmailMap, mongoAdminId) {
  if (!mongoAdminId) return null;
  const email = adminEmailMap.get(String(mongoAdminId));
  if (!email) throw new Error(`Mongo admin ${mongoAdminId} not found in the adminusers collection`);
  const r = await pgClient.query('SELECT id FROM profiles WHERE email = $1', [email]);
  if (!r.rows[0]) throw new Error(`admin ${mongoAdminId} (${email}) has no migrated Supabase account yet`);
  return r.rows[0].id;
}

// Stage 2J-B — coupon_redemptions' coupon_id resolution, same pattern as
// resolveCoursePgId() (loads the coupons domain's own checkpoint).
const couponIdCachePromise = { current: null };
function resolveCouponPgId(mongoCouponId) {
  if (!mongoCouponId) return null;
  if (!couponIdCachePromise.current) {
    const { data } = loadCheckpoint('coupons');
    couponIdCachePromise.current = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.pgId]));
  }
  const pgId = couponIdCachePromise.current[String(mongoCouponId)];
  if (!pgId) throw new Error(`coupon ${mongoCouponId} has not been migrated yet — run --domain=coupons first`);
  return pgId;
}

async function resolveProfileId(pgClient, userEmailMap, mongoUserId) {
  if (!mongoUserId) return null;
  const email = userEmailMap.get(String(mongoUserId));
  if (!email) throw new Error(`Mongo user ${mongoUserId} not found in the users collection`);
  const r = await pgClient.query('SELECT id FROM profiles WHERE email = $1', [email]);
  if (!r.rows[0]) {
    throw new Error(`user ${mongoUserId} (${email}) has no migrated Supabase account yet — sign-up/user migration must run first`);
  }
  return r.rows[0].id;
}

// --- Domain definitions: export shape (Mongo) -> transform -> import shape (Postgres) ---

const DOMAINS = {
  trial_requests: {
    targetTable: "trial_requests",
    async export() {
      const TrialRequest = mongoose.connection.collection('trialrequests');
      return TrialRequest.find({}).toArray();
    },
    transform(doc) {
      return {
        name: doc.name,
        email: doc.email,
        phone: doc.phone ?? null,
        course: doc.course ?? null,
        message: doc.message ?? null,
        status: ['new', 'contacted', 'scheduled'].includes(doc.status) ? doc.status : 'new',
      };
    },
    validate(row) {
      if (!row.name || !row.email) throw new Error('trial_requests row missing name/email');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[String(sourceId)]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE trial_requests SET name=$1, email=$2, phone=$3, course=$4, message=$5, status=$6 WHERE id=$7`,
          [row.name, row.email, row.phone, row.course, row.message, row.status, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO trial_requests (name, email, phone, course, message, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [row.name, row.email, row.phone, row.course, row.message, row.status]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM trial_requests')).rows[0].count);
    },
  },

  subscribers: {
    targetTable: "subscribers",
    async export() {
      const Subscriber = mongoose.connection.collection('subscribers');
      return Subscriber.find({}).toArray();
    },
    transform(doc) {
      return { email: String(doc.email).toLowerCase(), status: 'subscribed' };
    },
    validate(row) {
      if (!row.email) throw new Error('subscribers row missing email');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[String(sourceId)]?.pgId;
      const r = await client.query(
        `INSERT INTO subscribers (email, status) VALUES ($1,$2)
         ON CONFLICT ((lower(email))) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [row.email, row.status]
      );
      return r.rows[0]?.id ?? existingPgId;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM subscribers')).rows[0].count);
    },
  },

  blogs: {
    targetTable: "blogs",
    async export() {
      const Blog = mongoose.connection.collection('blogs');
      return Blog.find({}).toArray();
    },
    transform(doc) {
      // Stage 2J-B / docs/stage-2j-b-lossless-mapping-contract.md §13:
      // category/readTime/coverImage/seo.canonicalUrl have no column on
      // the current `blogs` table (a real, pre-existing gap — see
      // docs/option-a-mongo-supabase-parity-map.md §9; no document this
      // stage found says whether the original omission was deliberate,
      // so that is not claimed here). Rather than either silently
      // dropping these values or growing the schema for a field with
      // zero real data behind it today, this migration tool fails
      // closed: any document that actually carries a non-empty value in
      // one of these fields is rejected with a named reason rather than
      // silently losing it. 0 real documents today means this path is
      // normally only exercised via synthetic fixtures.
      const droppedButPresent = [];
      if (doc.category != null && doc.category !== '') droppedButPresent.push('category');
      if (doc.readTime != null && doc.readTime !== '') droppedButPresent.push('readTime');
      if (doc.coverImage != null && doc.coverImage !== '') droppedButPresent.push('coverImage');
      if (doc.seo?.canonicalUrl != null && doc.seo.canonicalUrl !== '') droppedButPresent.push('seo.canonicalUrl');
      if (droppedButPresent.length > 0) {
        throw new Error(
          `blogs document ${doc._id} carries fields with no lossless Postgres destination ` +
          `(${droppedButPresent.join(', ')}) — refusing to silently drop them. ` +
          `See docs/stage-2j-b-lossless-mapping-contract.md §13.`
        );
      }
      return {
        title: doc.title,
        slug: doc.slug,
        content: doc.body,
        excerpt: doc.excerpt ?? null,
        tags: JSON.stringify(doc.tags ?? []),
        author_name: doc.author?.name ?? null,
        author_role: doc.author?.role ?? null,
        author_image: doc.author?.image ?? null,
        published: !!doc.published,
        views: doc.views ?? 0,
        published_at: doc.publishedAt ?? null,
        seo_title: doc.seo?.metaTitle ?? null,
        seo_description: doc.seo?.metaDescription ?? null,
      };
    },
    validate(row) {
      if (!row.title || !row.slug || !row.content) throw new Error('blogs row missing title/slug/content');
      // PR #70 review round 10, item 1: this generated fallback (no
      // source publishedAt, but published=true) is marked explicitly so
      // read-back exempts ONLY this field, ONLY on a call where it was
      // genuinely generated -- never a blanket "timestamps aren't
      // checked" exemption. See lib/read-back-verify.mjs's own header.
      if (row.published && !row.published_at) {
        row.published_at = new Date().toISOString();
        row.__generatedFields = [...(row.__generatedFields ?? []), 'published_at'];
      }
    },
    async upsert(client, sourceId, row) {
      const r = await client.query(
        `INSERT INTO blogs (title, slug, content, excerpt, tags, author_name, author_role, author_image, published, views, published_at, seo_title, seo_description)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (slug) DO UPDATE SET
           title=EXCLUDED.title, content=EXCLUDED.content, excerpt=EXCLUDED.excerpt,
           tags=EXCLUDED.tags, author_name=EXCLUDED.author_name, author_role=EXCLUDED.author_role,
           author_image=EXCLUDED.author_image, published=EXCLUDED.published, views=EXCLUDED.views,
           published_at=EXCLUDED.published_at, seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description
         RETURNING id`,
        [row.title, row.slug, row.content, row.excerpt, row.tags, row.author_name, row.author_role,
         row.author_image, row.published, row.views, row.published_at, row.seo_title, row.seo_description]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM blogs')).rows[0].count);
    },
  },

  // ---------------------------------------------------------------------
  // Stage 2F — the 12 new domains. Ordered so `--domain=all` migrates
  // courses before anything that references courses (wishlists,
  // certificates, reviews, course_progress, student_records) — see
  // resolveCoursePgId()'s own comment for why order matters here.
  // ---------------------------------------------------------------------

  courses: {
    targetTable: "courses",
    async export() {
      return mongoose.connection.collection('courses').find({}).toArray();
    },
    transform(doc) {
      const level = ['Beginner', 'Intermediate', 'Advanced', 'All levels'].includes(doc.level) ? doc.level : 'All levels';
      return {
        title: doc.title,
        description: doc.description,
        icon: doc.icon || '📘',
        level,
        price_minor: Math.round((doc.price ?? 0) * 100),
        tags: JSON.stringify(doc.tags ?? []),
        resources: JSON.stringify(doc.resources ?? []),
        modules: JSON.stringify(
          (doc.modules ?? []).map((m) => ({
            title: m.title, summary: m.summary ?? '', order: m.order ?? 0,
            lessons: (m.lessons ?? []).map((l) => ({
              title: l.title, type: l.type, url: l.url ?? '', content: l.content ?? '',
              duration: l.duration ?? '', resources: l.resources ?? [], order: l.order ?? 0,
            })),
          }))
        ),
        published: !!doc.published,
      };
    },
    validate(row) {
      if (!row.title || !row.description) throw new Error('courses row missing title/description');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE courses SET title=$1, description=$2, icon=$3, level=$4, price_minor=$5,
             tags=$6::jsonb, resources=$7::jsonb, modules=$8::jsonb, published=$9 WHERE id=$10`,
          [row.title, row.description, row.icon, row.level, row.price_minor, row.tags, row.resources, row.modules, row.published, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO courses (title, description, icon, level, price_minor, tags, resources, modules, published)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9) RETURNING id`,
        [row.title, row.description, row.icon, row.level, row.price_minor, row.tags, row.resources, row.modules, row.published]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM courses')).rows[0].count);
    },
  },

  contact_messages: {
    targetTable: "contact_messages",
    async export() {
      return mongoose.connection.collection('contactmessages').find({}).toArray();
    },
    transform(doc) {
      return {
        name: doc.name,
        email: doc.email,
        phone: doc.phone ?? null,
        subject: doc.subject,
        message: doc.message,
        // Never carry a raw IP into a column named ip_anon — no anonymized
        // value exists in the Mongo source (it stored the raw ipAddress),
        // so this is left null rather than migrating unanonymized data.
        status: ['new', 'in_progress', 'resolved', 'spam'].includes(doc.status) ? doc.status : 'new',
      };
    },
    validate(row) {
      if (!row.name || !row.email || !row.subject || !row.message) throw new Error('contact_messages row missing a required field');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE contact_messages SET name=$1, email=$2, phone=$3, subject=$4, message=$5, status=$6 WHERE id=$7`,
          [row.name, row.email, row.phone, row.subject, row.message, row.status, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO contact_messages (name, email, phone, subject, message, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [row.name, row.email, row.phone, row.subject, row.message, row.status]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM contact_messages')).rows[0].count);
    },
  },

  system_config: {
    targetTable: "system_config",
    async export() {
      return mongoose.connection.collection('systemconfigs').find({}).toArray();
    },
    transform(doc) {
      return { key: doc.key, value: doc.encrypted ? null : doc._value, description: doc.description ?? null, encrypted: !!doc.encrypted };
    },
    validate(row) {
      if (!row.key) throw new Error('system_config row missing key');
      if (row.encrypted) {
        // system_config (0012_new_domains_baseline.sql) deliberately has no
        // encryption support (only plain boolean flags are ever actually
        // set) — an encrypted Mongo value has nowhere safe to go and is
        // never decrypted by this tool. Surfaces as a normal `failed` row
        // with a clear, actionable reason rather than migrating a secret in
        // plaintext or silently dropping it.
        throw new Error(`system_config key "${row.key}" is encrypted in Mongo — re-set it manually post-cutover, not migrated`);
      }
    },
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO system_config (key, value, description) VALUES ($1,$2,$3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description`,
        [row.key, row.value, row.description]
      );
      return row.key;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM system_config')).rows[0].count);
    },
  },

  wishlists: {
    targetTable: "wishlists",
    needsUserMap: true,
    async export() {
      const docs = await mongoose.connection.collection('wishlists').find({}).toArray();
      const flat = [];
      // One Mongo doc holds an embedded array of {course, addedAt} per user;
      // Postgres normalizes this into one row per (user_id, course_id)
      // (lib/db/drizzle/0012) — flattened here into synthetic per-item
      // "documents" so the rest of this tool's 1-Mongo-doc-to-1-Postgres-row
      // framework (checkpointing, hashing, idempotency) applies unchanged.
      for (const w of docs) {
        for (const item of w.courses || []) {
          flat.push({ _id: `${w._id}:${item.course}`, user: w.user, course: item.course, addedAt: item.addedAt });
        }
      }
      return flat;
    },
    async transform(doc, ctx) {
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        course_id: resolveCoursePgId(doc.course),
        added_at: doc.addedAt ?? new Date(),
        // Round 10, item 1: per-field generated-fallback marker -- see
        // lib/read-back-verify.mjs's own header comment.
        __generatedFields: doc.addedAt == null ? ['added_at'] : [],
      };
    },
    validate() {},
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO wishlists (user_id, course_id, added_at) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, course_id) DO UPDATE SET added_at = EXCLUDED.added_at`,
        [row.user_id, row.course_id, row.added_at]
      );
      return encodeCompositeTargetId([row.user_id, row.course_id]);
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM wishlists')).rows[0].count);
    },
  },

  hifz_progress: {
    targetTable: "hifz_progress",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('hifzprogresses').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        chapter_id: doc.chapterId,
        chapter_name: doc.chapterName || null,
        total_verses: doc.totalVerses ?? 0,
        memorized_verses: JSON.stringify(doc.memorizedVerses ?? []),
        last_revised: doc.lastRevised ?? new Date(),
        __generatedFields: doc.lastRevised == null ? ['last_revised'] : [],
      };
    },
    validate(row) {
      if (!(row.chapter_id >= 1 && row.chapter_id <= 114)) throw new Error(`invalid chapter_id ${row.chapter_id}`);
    },
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO hifz_progress (user_id, chapter_id, chapter_name, total_verses, memorized_verses, last_revised)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)
         ON CONFLICT (user_id, chapter_id) DO UPDATE SET
           chapter_name = EXCLUDED.chapter_name, total_verses = EXCLUDED.total_verses,
           memorized_verses = EXCLUDED.memorized_verses, last_revised = EXCLUDED.last_revised`,
        [row.user_id, row.chapter_id, row.chapter_name, row.total_verses, row.memorized_verses, row.last_revised]
      );
      return encodeCompositeTargetId([row.user_id, row.chapter_id]);
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM hifz_progress')).rows[0].count);
    },
  },

  certificates: {
    targetTable: "certificates",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('certificates').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        certificate_number: doc.certificateNumber,
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        student_name: doc.studentName,
        type: ['ijazah', 'completion', 'hifz', 'attendance'].includes(doc.type) ? doc.type : 'completion',
        title: doc.title,
        course_id: doc.course ? resolveCoursePgId(doc.course) : null,
        issued_by: doc.issuedBy || null,
        grade: doc.grade || null,
        notes: doc.notes || null,
        issued_at: doc.issuedAt ?? new Date(),
        revoked: !!doc.revoked,
        __generatedFields: doc.issuedAt == null ? ['issued_at'] : [],
      };
    },
    validate(row) {
      if (!row.certificate_number || !row.user_id || !row.student_name || !row.title) {
        throw new Error('certificates row missing a required field');
      }
    },
    async upsert(client, sourceId, row) {
      const r = await client.query(
        `INSERT INTO certificates (certificate_number, user_id, student_name, type, title, course_id, issued_by, grade, notes, issued_at, revoked)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (certificate_number) DO UPDATE SET
           student_name = EXCLUDED.student_name, title = EXCLUDED.title, grade = EXCLUDED.grade,
           notes = EXCLUDED.notes, revoked = EXCLUDED.revoked
         RETURNING id`,
        [row.certificate_number, row.user_id, row.student_name, row.type, row.title, row.course_id, row.issued_by, row.grade, row.notes, row.issued_at, row.revoked]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM certificates')).rows[0].count);
    },
  },

  reviews: {
    targetTable: "reviews",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('reviews').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        student_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.student),
        teacher_id: doc.teacher ? await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.teacher) : null,
        course_id: doc.course ? resolveCoursePgId(doc.course) : null,
        rating: doc.rating,
        title: doc.title || null,
        body: doc.body,
        status: ['pending', 'approved', 'rejected'].includes(doc.status) ? doc.status : 'pending',
        helpful: doc.helpful ?? 0,
      };
    },
    validate(row) {
      if (!row.body || !(row.rating >= 1 && row.rating <= 5)) throw new Error('reviews row missing body/valid rating');
      if (!row.teacher_id && !row.course_id) throw new Error('reviews row has neither teacher_id nor course_id');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE reviews SET rating=$1, title=$2, body=$3, status=$4, helpful=$5 WHERE id=$6`,
          [row.rating, row.title, row.body, row.status, row.helpful, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO reviews (student_id, teacher_id, course_id, rating, title, body, status, helpful)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [row.student_id, row.teacher_id, row.course_id, row.rating, row.title, row.body, row.status, row.helpful]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM reviews')).rows[0].count);
    },
  },

  referrals: {
    targetTable: "referrals",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('referrals').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        referrer_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.referrer),
        referee_id: doc.referee ? await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.referee) : null,
        code: doc.code,
        status: ['pending', 'converted', 'rewarded', 'expired'].includes(doc.status) ? doc.status : 'pending',
        converted_at: doc.convertedAt ?? null,
        rewarded_at: doc.rewardedAt ?? null,
      };
    },
    validate(row) {
      if (!row.referrer_id || !row.code) throw new Error('referrals row missing referrer_id/code');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE referrals SET status=$1, converted_at=$2, rewarded_at=$3 WHERE id=$4`,
          [row.status, row.converted_at, row.rewarded_at, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO referrals (referrer_id, referee_id, code, status, converted_at, rewarded_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [row.referrer_id, row.referee_id, row.code, row.status, row.converted_at, row.rewarded_at]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM referrals')).rows[0].count);
    },
  },

  course_progress: {
    targetTable: "course_progress",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('courseprogresses').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        course_id: resolveCoursePgId(doc.course),
        completed: JSON.stringify(doc.completed ?? []),
        last_activity: doc.lastActivity ?? new Date(),
        __generatedFields: doc.lastActivity == null ? ['last_activity'] : [],
      };
    },
    validate() {},
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO course_progress (user_id, course_id, completed, last_activity) VALUES ($1,$2,$3::jsonb,$4)
         ON CONFLICT (user_id, course_id) DO UPDATE SET completed = EXCLUDED.completed, last_activity = EXCLUDED.last_activity`,
        [row.user_id, row.course_id, row.completed, row.last_activity]
      );
      return encodeCompositeTargetId([row.user_id, row.course_id]);
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM course_progress')).rows[0].count);
    },
  },

  live_classes: {
    targetTable: "live_classes",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('liveclasses').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        teacher_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.teacher),
        student_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.student),
        title: doc.title,
        starts_at: doc.startsAt,
        duration_min: doc.durationMin ?? 30,
        meeting_url: doc.meetingUrl || null,
        notes: doc.notes || null,
        status: ['scheduled', 'cancelled', 'completed'].includes(doc.status) ? doc.status : 'scheduled',
      };
    },
    validate(row) {
      if (!row.title || !row.starts_at) throw new Error('live_classes row missing title/starts_at');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE live_classes SET title=$1, starts_at=$2, duration_min=$3, meeting_url=$4, notes=$5, status=$6 WHERE id=$7`,
          [row.title, row.starts_at, row.duration_min, row.meeting_url, row.notes, row.status, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO live_classes (teacher_id, student_id, title, starts_at, duration_min, meeting_url, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [row.teacher_id, row.student_id, row.title, row.starts_at, row.duration_min, row.meeting_url, row.notes, row.status]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM live_classes')).rows[0].count);
    },
  },

  messages: {
    targetTable: "messages",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('messages').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        from_user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.from),
        to_user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.to),
        body: doc.body,
        read_at: doc.readAt ?? null,
        created_at: doc.createdAt ?? new Date(),
        __generatedFields: doc.createdAt == null ? ['created_at'] : [],
      };
    },
    validate(row) {
      if (!row.body) throw new Error('messages row missing body');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(`UPDATE messages SET read_at=$1 WHERE id=$2`, [row.read_at, existingPgId]);
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO messages (from_user_id, to_user_id, body, read_at, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [row.from_user_id, row.to_user_id, row.body, row.read_at, row.created_at]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM messages')).rows[0].count);
    },
  },

  student_records: {
    targetTable: "student_records",
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('studentrecords').find({}).toArray();
    },
    async transform(doc, ctx) {
      return {
        student_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.student),
        teacher_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.teacher),
        course_id: doc.course ? resolveCoursePgId(doc.course) : null,
        record_date: doc.date ?? new Date(),
        __generatedFields: doc.date == null ? ['record_date'] : [],
        grade: doc.grade ?? null,
        grade_label: doc.gradeLabel || null,
        attendance: ['present', 'absent', 'late', 'excused'].includes(doc.attendance) ? doc.attendance : 'unmarked',
        memo_from: doc.memoFrom || null,
        memo_to: doc.memoTo || null,
        review: doc.review || null,
        tajweed: doc.tajweed || null,
        homework: doc.homework || null,
        note: doc.note || null,
      };
    },
    validate(row) {
      if (row.grade != null && !(row.grade >= 0 && row.grade <= 100)) throw new Error(`invalid grade ${row.grade}`);
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE student_records SET grade=$1, grade_label=$2, attendance=$3, memo_from=$4, memo_to=$5, review=$6, tajweed=$7, homework=$8, note=$9 WHERE id=$10`,
          [row.grade, row.grade_label, row.attendance, row.memo_from, row.memo_to, row.review, row.tajweed, row.homework, row.note, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO student_records
           (student_id, teacher_id, course_id, record_date, grade, grade_label, attendance, memo_from, memo_to, review, tajweed, homework, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [row.student_id, row.teacher_id, row.course_id, row.record_date, row.grade, row.grade_label, row.attendance, row.memo_from, row.memo_to, row.review, row.tajweed, row.homework, row.note]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM student_records')).rows[0].count);
    },
  },

  // ---------------------------------------------------------------------
  // Stage 2J-B — the 11 domains Stage 2J-A found missing entirely.
  // ---------------------------------------------------------------------

  payments: {
    targetTable: 'payments',
    needsUserMap: true,
    needsPlanCatalog: true,
    async export() {
      return mongoose.connection.collection('payments').find({}).toArray();
    },
    async transform(doc, ctx) {
      throwIfFaultStage('during_payments');
      const statusMap = { pending: 'pending', paid: 'succeeded', failed: 'failed' };
      const status = statusMap[doc.status];
      if (!status) throw new Error(`payments row has unmapped status "${doc.status}" — not pending/paid/failed`);

      if (!['stripe', 'paypal'].includes(doc.gateway)) {
        throw new Error(`payments row has unsupported gateway "${doc.gateway}"`);
      }
      if (String(doc.currency ?? 'EUR') !== 'EUR') {
        throw new Error(`payments row currency "${doc.currency}" is not EUR — currency conversion is never performed silently`);
      }
      const cents = Number(doc.amount) * 100;
      if (!Number.isFinite(cents) || Math.abs(cents - Math.round(cents)) > 1e-6) {
        throw new Error(`payments row amount ${doc.amount} does not convert cleanly to integer minor units`);
      }
      const amountMinor = Math.round(cents);

      let planId = null;
      if (doc.plan) {
        const slug = ctx.resolvePlanSlug(doc.plan);
        if (!slug || !ctx.planSlugToId?.has(slug)) {
          throw new Error(`payments row plan "${doc.plan}" does not resolve to a known plan slug`);
        }
        planId = ctx.planSlugToId.get(slug);
      }

      const userId = doc.userId ? await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.userId).catch(() => null) : null;

      return {
        user_id: userId,
        plan_id: planId,
        kind: 'charge',
        amount_minor: amountMinor,
        currency_snapshot: 'EUR',
        gateway: doc.gateway,
        gateway_payment_id: doc.gatewayTxnId || null,
        gateway_order_id: doc.gatewayOrderId || null,
        status,
        customer_name_snapshot: doc.customer?.name || null,
        customer_email_snapshot: doc.customer?.email || null,
        customer_phone_snapshot: doc.customer?.phone || null,
        created_at: doc.createdAt ?? new Date(),
        updated_at: doc.updatedAt ?? new Date(),
        _raw: doc.raw ?? null,
      };
    },
    validate(row) {
      if (row.amount_minor < 0) throw new Error('payments row has negative amount_minor');
      if (!row.gateway) throw new Error('payments row missing gateway');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      let pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE payments SET status=$1, customer_name_snapshot=$2, customer_email_snapshot=$3, customer_phone_snapshot=$4 WHERE id=$5`,
          [row.status, row.customer_name_snapshot, row.customer_email_snapshot, row.customer_phone_snapshot, existingPgId]
        );
        pgId = existingPgId;
      } else {
        const r = await client.query(
          `INSERT INTO payments
             (user_id, plan_id, kind, amount_minor, currency_snapshot, gateway, gateway_payment_id, gateway_order_id,
              status, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
          [row.user_id, row.plan_id, row.kind, row.amount_minor, row.currency_snapshot, row.gateway, row.gateway_payment_id,
           row.gateway_order_id, row.status, row.customer_name_snapshot, row.customer_email_snapshot, row.customer_phone_snapshot,
           row.created_at, row.updated_at]
        );
        pgId = r.rows[0].id;
      }
      // The raw gateway payload — never dropped, never exposed beyond
      // service_role (payment_source_snapshots, 0022). Idempotent: one
      // row per payment_id.
      await client.query(
        `INSERT INTO payment_source_snapshots (payment_id, source_system, source_collection, source_document_id, raw_payload)
         VALUES ($1, 'mongodb', 'payments', $2, $3::jsonb)
         ON CONFLICT (payment_id) DO NOTHING`,
        [pgId, sourceId, row._raw ? JSON.stringify(row._raw) : null]
      );
      return pgId;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM payments')).rows[0].count);
    },
  },

  enrollments: {
    targetTable: 'enrollments',
    async export() {
      return mongoose.connection.collection('enrollments').find({}).toArray();
    },
    transform(doc) {
      const statusMap = { pending: 'new', contacted: 'contacted', enrolled: 'enrolled', cancelled: 'cancelled' };
      const status = statusMap[doc.status];
      if (!status) throw new Error(`enrollments row has unmapped status "${doc.status}"`);
      return {
        name: doc.name,
        email: doc.email,
        whatsapp: doc.whatsapp || null,
        country: doc.country || null,
        city: doc.city || null,
        timezone: doc.timezone || null,
        times: JSON.stringify(doc.times ?? []),
        subjects: JSON.stringify(doc.subjects ?? []),
        lang: doc.lang || null,
        level: doc.level || null,
        age_group: doc.ageGroup || null,
        gender_pref: doc.genderPref || null,
        preferred_teacher_key: doc.teacherId != null ? String(doc.teacherId) : null,
        preferred_teacher_name: doc.teacherName || null,
        requested_plan_slug: doc.plan || null,
        status,
        notes: doc.notes ?? null,
      };
    },
    validate(row) {
      if (!row.name || !row.email) throw new Error('enrollments row missing name/email');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(`UPDATE enrollments SET status=$1, notes=$2 WHERE id=$3`, [row.status, row.notes, existingPgId]);
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO enrollments
           (name, email, whatsapp, country, city, timezone, times, subjects, lang, level, age_group, gender_pref,
            preferred_teacher_key, preferred_teacher_name, requested_plan_slug, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [row.name, row.email, row.whatsapp, row.country, row.city, row.timezone, row.times, row.subjects, row.lang, row.level,
         row.age_group, row.gender_pref, row.preferred_teacher_key, row.preferred_teacher_name, row.requested_plan_slug, row.status, row.notes]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM enrollments')).rows[0].count);
    },
  },

  quran_bookmarks: {
    targetTable: 'quran_bookmarks',
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('quranbookmarks').find({}).toArray();
    },
    async transform(doc, ctx) {
      throwIfFaultStage('during_quran_import');
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        verse_key: doc.verseKey,
        chapter_id: doc.chapterId,
        verse_num: doc.verseNum,
        note: doc.note || null,
        color: doc.color || null,
      };
    },
    validate(row) {
      if (!row.verse_key || !row.user_id) throw new Error('quran_bookmarks row missing verse_key/user_id');
    },
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO quran_bookmarks (user_id, verse_key, chapter_id, verse_num, note, color)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, verse_key) DO UPDATE SET note = EXCLUDED.note, color = EXCLUDED.color`,
        [row.user_id, row.verse_key, row.chapter_id, row.verse_num, row.note, row.color]
      );
      return encodeCompositeTargetId([row.user_id, row.verse_key]);
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM quran_bookmarks')).rows[0].count);
    },
  },

  quran_reading_progress: {
    targetTable: 'quran_reading_progress',
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('quranreadingprogresses').find({}).toArray();
    },
    async transform(doc, ctx) {
      const allowedGoalTypes = ['verses', 'minutes', 'pages'];
      const goalType = doc.dailyGoal?.type;
      if (goalType && !allowedGoalTypes.includes(goalType)) {
        throw new Error(`quran_reading_progress row has unmapped dailyGoal.type "${goalType}"`);
      }
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        resume: JSON.stringify(doc.lastPosition ?? {}),
        goal: doc.dailyGoal?.target ?? null,
        goal_type: goalType || null,
        streak: doc.streak?.current ?? 0,
        longest_streak: doc.streak?.longest ?? 0,
        last_read_date: doc.streak?.lastReadDate || null,
        history: JSON.stringify(doc.history ?? []),
      };
    },
    validate() {},
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO quran_reading_progress (user_id, resume, goal, goal_type, streak, longest_streak, last_read_date, history)
         VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET
           resume=EXCLUDED.resume, goal=EXCLUDED.goal, goal_type=EXCLUDED.goal_type, streak=EXCLUDED.streak,
           longest_streak=EXCLUDED.longest_streak, last_read_date=EXCLUDED.last_read_date, history=EXCLUDED.history`,
        [row.user_id, row.resume, row.goal, row.goal_type, row.streak, row.longest_streak, row.last_read_date, row.history]
      );
      return row.user_id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM quran_reading_progress')).rows[0].count);
    },
  },

  quran_memorization_stats: {
    targetTable: 'quran_memorization_stats',
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('quranmemorizationstats').find({}).toArray();
    },
    async transform(doc, ctx) {
      const allowedGoalTypes = ['verses', 'minutes'];
      const goalType = doc.dailyGoal?.type;
      if (goalType && !allowedGoalTypes.includes(goalType)) {
        throw new Error(`quran_memorization_stats row has unmapped dailyGoal.type "${goalType}"`);
      }
      // DERIVED_WITH_PROOF (mapping contract §11): this collection's
      // streak.lastReadDate and stats.lastPracticeDate are proven, per
      // document, to carry the same value (a copy-paste artifact in the
      // original Mongo schema) — recorded once as last_practice_date,
      // not duplicated into a second column. Proof is the equality check
      // below; a mismatch is a hard FAIL, never a silent pick-one.
      const a = doc.streak?.lastReadDate || null;
      const b = doc.stats?.lastPracticeDate || null;
      if (a && b && a !== b) {
        throw new Error(`quran_memorization_stats row: streak.lastReadDate ("${a}") and stats.lastPracticeDate ("${b}") disagree — cannot losslessly collapse to one column`);
      }
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        goal: doc.dailyGoal?.target ?? null,
        goal_type: goalType || null,
        total_recordings: doc.stats?.totalRecordings ?? 0,
        total_practice_time: doc.stats?.totalPracticeTime ?? 0,
        streak: doc.streak?.current ?? 0,
        longest_streak: doc.streak?.longest ?? 0,
        last_practice_date: a || b || null,
      };
    },
    validate() {},
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO quran_memorization_stats
           (user_id, goal, goal_type, total_recordings, total_practice_time, streak, longest_streak, last_practice_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id) DO UPDATE SET
           goal=EXCLUDED.goal, goal_type=EXCLUDED.goal_type, total_recordings=EXCLUDED.total_recordings,
           total_practice_time=EXCLUDED.total_practice_time, streak=EXCLUDED.streak,
           longest_streak=EXCLUDED.longest_streak, last_practice_date=EXCLUDED.last_practice_date`,
        [row.user_id, row.goal, row.goal_type, row.total_recordings, row.total_practice_time, row.streak, row.longest_streak, row.last_practice_date]
      );
      return row.user_id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM quran_memorization_stats')).rows[0].count);
    },
  },

  coupons: {
    targetTable: 'coupons',
    async export() {
      return mongoose.connection.collection('coupons').find({}).toArray();
    },
    transform(doc) {
      if (!['percent', 'fixed'].includes(doc.discountType)) {
        throw new Error(`coupons row has unmapped discountType "${doc.discountType}"`);
      }
      return {
        code: doc.code,
        description: doc.description || null,
        type: doc.discountType,
        value: doc.discountValue,
        // DERIVED_WITH_PROOF (mapping contract §Coupons): the old Mongo
        // model applies its discount once, at checkout time
        // (Coupon.calculateDiscount(), called from the order-creation
        // path only) — never re-applied against a recurring renewal.
        // 'first_payment_only' is the only value in the new
        // discount_scope vocabulary that matches that real, observed
        // behavior; not a guessed default.
        discount_scope: 'first_payment_only',
        discount_duration_cycles: null,
        max_uses: doc.maxUses ?? null,
        expires_at: doc.validUntil ?? null,
        active: !!doc.active,
      };
    },
    validate(row) {
      if (!row.code || !row.value) throw new Error('coupons row missing code/value');
      if (row.type === 'percent' && row.value > 100) throw new Error(`coupons row percent value ${row.value} exceeds 100`);
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(`UPDATE coupons SET active=$1, expires_at=$2, max_uses=$3 WHERE id=$4`, [row.active, row.expires_at, row.max_uses, existingPgId]);
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO coupons (code, description, type, value, discount_scope, discount_duration_cycles, max_uses, expires_at, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [row.code, row.description, row.type, row.value, row.discount_scope, row.discount_duration_cycles, row.max_uses, row.expires_at, row.active]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM coupons')).rows[0].count);
    },
  },

  coupon_redemptions: {
    targetTable: 'coupon_redemptions',
    needsUserMap: true,
    async export() {
      const docs = await mongoose.connection.collection('coupons').find({}).toArray();
      const flat = [];
      for (const c of docs) {
        for (const use of c.usedBy || []) {
          flat.push({ _id: `${c._id}:${use.user}`, coupon: c._id, user: use.user, usedAt: use.usedAt });
        }
      }
      return flat;
    },
    async transform(doc, ctx) {
      return {
        coupon_id: resolveCouponPgId(doc.coupon),
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.user),
        used_at: doc.usedAt ?? new Date(),
        __generatedFields: doc.usedAt == null ? ['used_at'] : [],
      };
    },
    validate() {},
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO coupon_redemptions (coupon_id, user_id, used_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [row.coupon_id, row.user_id, row.used_at]
      );
      return encodeCompositeTargetId([row.coupon_id, row.user_id]);
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM coupon_redemptions')).rows[0].count);
    },
  },

  manual_payments: {
    targetTable: 'manual_payments',
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('manualpayments').find({}).toArray();
    },
    async transform(doc, ctx) {
      if (!doc.userId) {
        // manual_payments.user_id is NOT NULL (unlike payments — Stage
        // 2J-B's Part D problem list named only `payments` for the
        // nullable-user_id fix) — a manual payment with no linked
        // account fails closed rather than silently gaining a fake one.
        throw new Error('manual_payments row has no userId — manual_payments.user_id is NOT NULL, not silently defaulted');
      }
      if (!['pending', 'approved', 'rejected'].includes(doc.status)) {
        throw new Error(`manual_payments row has unmapped status "${doc.status}"`);
      }
      const cents = Number(doc.amount) * 100;
      if (!Number.isFinite(cents) || Math.abs(cents - Math.round(cents)) > 1e-6) {
        throw new Error(`manual_payments row amount ${doc.amount} does not convert cleanly to integer minor units`);
      }
      if (String(doc.currency ?? 'EUR') !== 'EUR') {
        throw new Error(`manual_payments row currency "${doc.currency}" is not EUR`);
      }
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.userId),
        amount_minor: Math.round(cents),
        method: doc.method,
        reference: doc.reference || null,
        notes: doc.notes || null,
        status: doc.status,
        admin_note: doc.adminNote || null,
        created_at: doc.createdAt ?? new Date(),
        updated_at: doc.updatedAt ?? new Date(),
        __generatedFields: [
          ...(doc.createdAt == null ? ['created_at'] : []),
          ...(doc.updatedAt == null ? ['updated_at'] : []),
        ],
      };
    },
    validate(row) {
      if (!row.method) throw new Error('manual_payments row missing method');
    },
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(`UPDATE manual_payments SET status=$1, admin_note=$2 WHERE id=$3`, [row.status, row.admin_note, existingPgId]);
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO manual_payments (user_id, amount_minor, currency_snapshot, method, reference, notes, status, admin_note, created_at, updated_at)
         VALUES ($1,$2,'EUR',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [row.user_id, row.amount_minor, row.method, row.reference, row.notes, row.status, row.admin_note, row.created_at, row.updated_at]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM manual_payments')).rows[0].count);
    },
  },

  invoices: {
    targetTable: 'invoices',
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('invoices').find({}).toArray();
    },
    async transform(doc, ctx) {
      if (!doc.payment) throw new Error('invoices row has no linked payment — issue_invoice_from_payment() requires one');
      const paymentLedger = await findLedgerEntry(ctx.pgClient, {
        sourceDatabase: SOURCE_DATABASE, sourceCollection: 'payments', sourceDocumentId: String(doc.payment), targetTable: 'payments',
      });
      if (!paymentLedger || !paymentLedger.target_id) {
        throw new Error(`invoices row references payment ${doc.payment}, which has not been migrated yet — run --domain=payments first`);
      }
      return { payment_id: paymentLedger.target_id };
    },
    validate(row) {
      if (!row.payment_id) throw new Error('invoices row could not resolve payment_id');
    },
    // Review round 4: MUST use the context-only helper, never the
    // transaction-OWNING withImpersonatedAdmin() -- this upsert() is
    // called from INSIDE migrateDomain()'s own already-open BEGIN
    // (together with markCreated(), as one atomic unit — see that
    // function's own comment). withImpersonatedAdmin() would issue its
    // own nested BEGIN/COMMIT, and Postgres does not support real nested
    // transactions: its COMMIT would silently commit the OUTER
    // transaction too, immediately after the invoice write and BEFORE
    // markCreated() ever runs — a real, previously-shipped bug (see
    // lib/admin-rpc.mjs's own comment on withImpersonatedAdminContext()
    // for the full story). withImpersonatedAdminContext() sets up/tears
    // down the impersonation only, leaving BEGIN/COMMIT/ROLLBACK entirely
    // to the caller, exactly as this call site now needs.
    // Review round 4: also fixes a real, previously-undetected bug found
    // WHILE proving the transaction fix above with a live invoice (this
    // domain has 0 real documents in the actual dump, so this exact code
    // path had never been exercised end-to-end before). `issue_invoice_
    // from_payment` returns a composite `public.invoices` row; `pg` does
    // NOT auto-parse an arbitrary composite type into a JS object (no
    // type parser is registered for it), so `SELECT f($1) AS invoice`
    // came back as an opaque string and `r.rows[0].invoice.id` was
    // silently `undefined` -- markCreated() then received `undefined`
    // and stored target_id as NULL (its own documented behavior for a
    // missing id), yet the process still reported success and the ledger
    // row still reached 'reconciled'. Fixed by extracting the one field
    // actually needed directly in SQL via Postgres's composite field-
    // access syntax `(f($1)).id`, which `pg` parses as a plain scalar
    // column like any other.
    async upsert(client, sourceId, row) {
      return withImpersonatedAdminContext(client, async (c) => {
        const r = await c.query(`SELECT (issue_invoice_from_payment($1)).id AS id`, [row.payment_id]);
        return r.rows[0].id;
      });
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM invoices')).rows[0].count);
    },
  },

  notifications: {
    targetTable: 'notifications',
    needsUserMap: true,
    async export() {
      return mongoose.connection.collection('notifications').find({}).toArray();
    },
    async transform(doc, ctx) {
      // The redesigned notification_type vocabulary is intentionally
      // narrower (LMS-free) — only these 5 of the old model's 14 values
      // overlap. Any other value fails closed rather than being silently
      // dropped or reinterpreted.
      const allowed = ['payment_received', 'payment_failed', 'subscription_renewed', 'subscription_expiring', 'admin_announcement'];
      if (!allowed.includes(doc.type)) {
        throw new Error(`notifications row has type "${doc.type}", not in the new (LMS-free) notification_type vocabulary — no destination`);
      }
      return {
        user_id: await resolveProfileId(ctx.pgClient, ctx.userEmailMap, doc.recipient),
        type: doc.type,
        title: doc.title,
        body: doc.body || null,
        link: doc.link || null,
        read: !!doc.read,
        meta: doc.data ? JSON.stringify(doc.data) : null,
        created_at: doc.createdAt ?? new Date(),
        __generatedFields: doc.createdAt == null ? ['created_at'] : [],
      };
    },
    validate(row) {
      if (!row.title) throw new Error('notifications row missing title');
    },
    // Review round 3: this domain has no natural unique key to dedupe on
    // (unlike blogs' slug, subscribers' email, etc.), so it MUST honor
    // checkpoint[sourceId]?.pgId (== resumeTargetId once migrateDomain()
    // has proven the row still exists) the same way trial_requests/
    // contact_messages/etc. do -- a plain unconditional INSERT here was
    // exactly the gap that let a kill-window-3 resume silently create a
    // duplicate, orphaned row.
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) {
        await client.query(
          `UPDATE notifications SET user_id=$1, type=$2, title=$3, body=$4, link=$5, read=$6, meta=$7::jsonb, created_at=$8 WHERE id=$9`,
          [row.user_id, row.type, row.title, row.body, row.link, row.read, row.meta, row.created_at, existingPgId]
        );
        return existingPgId;
      }
      const r = await client.query(
        `INSERT INTO notifications (user_id, type, title, body, link, read, meta, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
        [row.user_id, row.type, row.title, row.body, row.link, row.read, row.meta, row.created_at]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM notifications')).rows[0].count);
    },
  },

  system_audit_logs: {
    targetTable: 'admin_audit_log',
    async export() {
      return mongoose.connection.collection('systemauditlogs').find({}).toArray();
    },
    async transform(doc, ctx) {
      if (doc.userAgent || doc.ipAnon || doc.metadata) {
        throw new Error('system_audit_logs row carries userAgent/ipAnon/metadata — admin_audit_log has no column for these, failing closed rather than dropping silently');
      }
      if (!['info', 'warning', 'critical'].includes(doc.severity)) {
        throw new Error(`system_audit_logs row has unmapped severity "${doc.severity}"`);
      }
      const adminEmailMap = ctx.adminEmailMap ?? (ctx.adminEmailMap = await loadAdminEmailMap());
      return {
        actor_admin_id: await resolveAdminProfileId(ctx.pgClient, adminEmailMap, doc.adminId),
        action: doc.action,
        resource_type: doc.resource,
        resource_id: doc.resourceId != null ? String(doc.resourceId) : null,
        before: doc.before ? JSON.stringify(doc.before) : null,
        after: doc.after ? JSON.stringify(doc.after) : null,
        severity: doc.severity,
        created_at: doc.createdAt ?? new Date(),
        __generatedFields: doc.createdAt == null ? ['created_at'] : [],
      };
    },
    validate(row) {
      if (!row.actor_admin_id || !row.action || !row.resource_type) throw new Error('system_audit_logs row missing actor_admin_id/action/resource_type');
    },
    // Review round 3: same no-natural-key gap as notifications above, but
    // admin_audit_log additionally has forbid_audit_log_mutation()
    // (0001_functions_triggers.sql) blocking UPDATE for every role,
    // service_role included -- an UPDATE-on-resume like notifications'
    // would itself throw. On resume (existingPgId set, proven by
    // migrateDomain()'s verifyTargetRowExists() to still be present),
    // the correct action is therefore to reuse the id with NO write at
    // all: an audit log's content cannot legitimately change anyway, so
    // there is nothing to update even if the trigger allowed it.
    async upsert(client, sourceId, row, checkpoint) {
      const existingPgId = checkpoint[sourceId]?.pgId;
      if (existingPgId) return existingPgId;
      const r = await client.query(
        `INSERT INTO admin_audit_log (actor_admin_id, action, resource_type, resource_id, before, after, severity, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) RETURNING id`,
        [row.actor_admin_id, row.action, row.resource_type, row.resource_id, row.before, row.after, row.severity, row.created_at]
      );
      return r.rows[0].id;
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM admin_audit_log')).rows[0].count);
    },
  },

  document_counters: {
    targetTable: 'document_counters',
    async export() {
      return mongoose.connection.collection('counters').find({}).toArray();
    },
    transform(doc) {
      const m = /^(.+)-(\d{4})$/.exec(String(doc._id));
      if (!m) throw new Error(`counters row _id "${doc._id}" does not match the expected "<scope>-<year>" shape`);
      return { scope: m[1], year: Number(m[2]), seq: doc.seq ?? 0 };
    },
    validate(row) {
      if (!row.scope) throw new Error('document_counters row missing scope');
    },
    async upsert(client, sourceId, row) {
      await client.query(
        `INSERT INTO document_counters (scope, year, seq) VALUES ($1,$2,$3)
         ON CONFLICT (scope, year) DO UPDATE SET seq = GREATEST(document_counters.seq, EXCLUDED.seq)`,
        [row.scope, row.year, row.seq]
      );
      return encodeCompositeTargetId([row.scope, row.year]);
    },
    async countPg(client) {
      return Number((await client.query('SELECT count(*) FROM document_counters')).rows[0].count);
    },
  },
};

// --- Rollback ---
//
// Every upsert() above returns the exact pgId (a uuid, a text PK, or a
// "a:b" composite-key string) recorded in that domain's checkpoint file —
// rollback uses that same record to delete precisely, and only, the rows
// THIS tool created or touched, nothing else. table/pk describe how to turn
// a recorded pgId back into a DELETE statement; composite keys (":"-joined)
// need their own delete shape since there's no single `id` column to match.
// PR #70 review round 10, item 2: `nonColumnFields` on a spec entry below
// is the explicit, per-table allowlist lib/read-back-verify.mjs's
// verifyReadBack() now REQUIRES for any `expectedFields` key that is not
// a real column on that table -- a typo'd/nonexistent column name is now
// a hard read-back failure everywhere else, on purpose (see that file's
// own header). `__generatedFields` is this round's own per-document
// generated-timestamp marker (item 1); `_raw` is payments' own
// pre-existing helper field (payments' domain logic itself is
// deliberately NOT touched this round -- deferred, see DEFERRED_DOMAIN_
// REASONS in production-import-orchestrator.mjs -- this is only the
// generic read-back plumbing every domain shares).
const ROLLBACK_SPEC = {
  trial_requests:  { table: 'trial_requests' },
  subscribers:     { table: 'subscribers' },
  blogs:           { table: 'blogs', nonColumnFields: ['__generatedFields'] },
  courses:         { table: 'courses' },
  contact_messages:{ table: 'contact_messages' },
  system_config:   { table: 'system_config', pkColumn: 'key' },
  wishlists:       { table: 'wishlists', composite: ['user_id', 'course_id'], nonColumnFields: ['__generatedFields'] },
  hifz_progress:   { table: 'hifz_progress', composite: ['user_id', 'chapter_id'], nonColumnFields: ['__generatedFields'] },
  certificates:    { table: 'certificates', nonColumnFields: ['__generatedFields'] },
  reviews:         { table: 'reviews' },
  referrals:       { table: 'referrals' },
  course_progress: { table: 'course_progress', composite: ['user_id', 'course_id'], nonColumnFields: ['__generatedFields'] },
  live_classes:    { table: 'live_classes' },
  messages:        { table: 'messages', nonColumnFields: ['__generatedFields'] },
  student_records: { table: 'student_records', nonColumnFields: ['__generatedFields'] },
  // payments is ALSO immutable by design (forbid_payment_delete(),
  // 0001_functions_triggers.sql) — same treatment as invoices/
  // admin_audit_log below.
  payments:                  { table: 'payments', immutable: true, nonColumnFields: ['_raw'] },
  enrollments:               { table: 'enrollments' },
  quran_bookmarks:           { table: 'quran_bookmarks', composite: ['user_id', 'verse_key'] },
  quran_reading_progress:    { table: 'quran_reading_progress', pkColumn: 'user_id' },
  quran_memorization_stats:  { table: 'quran_memorization_stats', pkColumn: 'user_id' },
  coupons:                   { table: 'coupons' },
  coupon_redemptions:        { table: 'coupon_redemptions', composite: ['coupon_id', 'user_id'], nonColumnFields: ['__generatedFields'] },
  manual_payments:           { table: 'manual_payments', nonColumnFields: ['__generatedFields'] },
  document_counters:         { table: 'document_counters', composite: ['scope', 'year'] },
  // Review round 3: this entry was missing entirely -- discovered while
  // proving item 4's kill-window-3 resume test for notifications (with
  // the local checkpoint deleted). Without a ROLLBACK_SPEC entry,
  // verifyTargetRowExists(pgClient, spec, ...) receives spec=undefined
  // and unconditionally returns false (its own documented fail-closed
  // behavior for "an unknown domain shape"), so migrateDomain() could
  // never compute a resumeTargetId for this domain from the ledger alone
  // -- only the LOCAL checkpoint (when not lost) masked the gap, which is
  // exactly why the checkpoint-intact variant of that test passed while
  // the checkpoint-deleted variant caught it. notifications has no
  // forbid_*_mutation() trigger (unlike admin_audit_log) and no
  // composite/non-`id` primary key, so this is the plain, default shape.
  notifications: { table: 'notifications', nonColumnFields: ['__generatedFields'] },
  // invoices/admin_audit_log are immutable BY DESIGN — forbid_invoice_
  // mutation() / forbid_audit_log_mutation() (0001_functions_triggers.sql,
  // 0013_admin_rbac.sql) block UPDATE/DELETE for every role, service_role
  // included. A migrated row genuinely cannot be rolled back by deleting
  // it — this is a real, pre-existing security property of the schema,
  // not a gap in this tool. rollbackDomain() below reports this
  // explicitly rather than attempting a DELETE that would only ever fail.
  invoices:           { table: 'invoices', immutable: true },
  system_audit_logs:  { table: 'admin_audit_log', immutable: true, nonColumnFields: ['__generatedFields'] },
};

async function rollbackDomain(domainName, { pgClient }) {
  const spec = ROLLBACK_SPEC[domainName];
  if (!spec) throw new Error(`No rollback spec for domain: ${domainName}`);

  if (spec.immutable) {
    console.log(`[${domainName}] rollback: NOT SUPPORTED — ${spec.table} rows are immutable by design (forbid_*_mutation() trigger blocks DELETE for every role). Migrated rows stay; this is a real schema property, not a tool gap.`);
    return { domain: domainName, deleted: 0, immutable: true };
  }

  // Stage 2J-B Part H fix (review round 2): rollback no longer clears
  // migration_source_ledger wholesale up front. That was itself unsafe:
  // wiping every ledger row for this domain BEFORE any target row is
  // actually deleted means a row whose DELETE later fails is left with
  // NO ledger record at all, even though the row still physically
  // exists — exactly the "unrecorded data" state this whole tool's
  // ledger design exists to make impossible. Each row's target-table
  // DELETE and its OWN ledger-row DELETE now happen together, inside one
  // transaction, per row (see the loop below) — so a row is only ever
  // ledger-cleared at the exact moment its target row is verified gone.
  const { file: checkpointFile, data: checkpoint } = loadCheckpoint(domainName);
  let entries = Object.entries(checkpoint);

  // If the local checkpoint is missing/empty, it is NOT "nothing to roll
  // back" — the DB-side ledger is the rollback source of truth (this is
  // the exact resume-after-checkpoint-loss guarantee the ledger exists
  // for, applied to rollback instead of forward migration). Any row with
  // a target_id genuinely has a real target row to roll back, REGARDLESS
  // of its final status: 'created'/'reconciled' are the obvious cases,
  // but 'failed' with a target_id set is real too (review round 3) --
  // that is exactly kill-window 3 (a crash between markCreated and
  // markReconciled): the outer catch always calls markFailed(), even for
  // an injected fault, which overwrites status to 'failed' but never
  // touches target_id (see markFailed()'s own definition). Excluding
  // 'failed' rows here left them permanently un-rollback-able once the
  // checkpoint was lost -- no checkpoint entry, no ledger entry after a
  // rollback attempt "succeeded" by finding nothing, the row itself still
  // physically present. A 'planned'-only row never reached a target
  // write (per the migrateDomain fix above) and so never has a target_id
  // -- it is correctly excluded by the target_id IS NOT NULL check alone,
  // no status filtering needed for that case.
  let usingLedgerFallback = false;
  if (entries.length === 0) {
    const ledgerRows = await pgClient.query(
      `SELECT source_document_id, target_id FROM migration_source_ledger
       WHERE source_system = 'mongodb' AND source_database = $1 AND source_collection = $2
         AND target_table = $3 AND target_id IS NOT NULL AND status IN ('created', 'reconciled', 'failed')`,
      [SOURCE_DATABASE, domainName, spec.table]
    );
    entries = ledgerRows.rows.map((r) => [r.source_document_id, { pgId: r.target_id }]);
    usingLedgerFallback = true;
  }

  if (entries.length === 0) {
    console.log(`[${domainName}] rollback: nothing to roll back (no checkpoint entries and no ledger rows)`);
    return { domain: domainName, deleted: 0, failed: 0 };
  }
  if (usingLedgerFallback) {
    console.log(`[${domainName}] rollback: local checkpoint missing/empty — using ${entries.length} row(s) from the DB-side ledger as the source of truth`);
  }

  let deleted = 0;
  let alreadyGone = 0;
  let failedCount = 0;
  const stillPending = {};

  for (const [sourceId, { pgId }] of entries) {
    try {
      await pgClient.query('BEGIN');
      let result;
      if (spec.composite) {
        const [a, b] = decodeCompositeTargetId(pgId);
        result = await pgClient.query(`DELETE FROM ${spec.table} WHERE ${spec.composite[0]} = $1 AND ${spec.composite[1]} = $2`, [a, b]);
      } else {
        result = await pgClient.query(`DELETE FROM ${spec.table} WHERE ${spec.pkColumn ?? 'id'} = $1`, [pgId]);
      }
      // Test-only hook: a fault injected here fires AFTER the target
      // DELETE above but BEFORE the ledger DELETE below and the COMMIT --
      // proves the two are genuinely one transaction (the target DELETE
      // is undone too), not proves it by inspection.
      throwIfFaultStage('during_rollback_before_ledger_delete');

      // Review round 3: never trust the DELETE's own rowCount/absence-of-
      // exception alone as proof the row is truly gone -- a BEFORE DELETE
      // trigger can legally veto a delete (RETURN NULL), which reports
      // rowCount=0, indistinguishable from "already gone" without this
      // check. This verification now runs INSIDE the transaction, BEFORE
      // the ledger row is touched and BEFORE COMMIT -- if the row is
      // still really there, the throw below aborts to the catch block,
      // which ROLLBACKs, so NEITHER the (never-actually-deleted) target
      // row NOR its ledger row is ever lost: both survive exactly as if
      // this rollback attempt for that row had never run.
      const stillPresentPreCommit = await verifyTargetRowExists(pgClient, spec, pgId);
      if (stillPresentPreCommit) {
        throw new Error(
          `target row still present after DELETE (sourceId=${sourceId} pgId=${pgId}) -- ` +
          `refusing to delete its ledger row or commit; both preserved`
        );
      }

      await pgClient.query(
        `DELETE FROM migration_source_ledger WHERE source_system = 'mongodb' AND source_database = $1
           AND source_collection = $2 AND source_document_id = $3 AND target_table = $4`,
        [SOURCE_DATABASE, domainName, sourceId, spec.table]
      );
      await pgClient.query('COMMIT');

      // A second, independent re-check once the transaction is durable --
      // belt-and-braces defense in depth (a separate query issued after
      // COMMIT, catching e.g. a concurrent re-insert racing the commit),
      // not the primary correctness gate. That gate is the pre-commit
      // check above, which is what actually decides commit vs. rollback.
      const stillPresentPostCommit = await verifyTargetRowExists(pgClient, spec, pgId);
      if (stillPresentPostCommit) {
        throw new Error(`CRITICAL: row present again after a verified DELETE + COMMIT (sourceId=${sourceId} pgId=${pgId}) -- possible concurrent re-insert`);
      }

      if (result.rowCount > 0) deleted += 1;
      else alreadyGone += 1;
      // Only a VERIFIED-successful deletion is ever dropped from the
      // checkpoint — a failed one stays, so a retry finds it again.
    } catch (err) {
      await pgClient.query('ROLLBACK').catch(() => {});
      failedCount += 1;
      stillPending[sourceId] = { pgId };
      console.error(`[${domainName}] rollback FAILED sourceId=${sourceId} pgId=${pgId}: ${err.message}`);
    }
  }

  // Persist only what's left to retry — everything verified-deleted is
  // gone from both the target table AND its own ledger row already (each
  // inside its own transaction above); nothing here re-clears the WHOLE
  // domain's checkpoint the way the old code did.
  saveCheckpoint(checkpointFile, stillPending);

  console.log(
    `[${domainName}] rollback: deleted ${deleted}/${entries.length} row(s)` +
      (alreadyGone ? `, ${alreadyGone} already gone` : '') +
      (failedCount ? `, ${failedCount} FAILED (left in place for retry)` : '') +
      (usingLedgerFallback ? ', source=ledger-fallback' : '')
  );
  return { domain: domainName, deleted, alreadyGone, failed: failedCount };
}

/**
 * Independently confirms a target row genuinely still exists on disk --
 * never trusts a ledger's target_id (or a local checkpoint's pgId) alone
 * as proof of presence. `spec` is a ROLLBACK_SPEC entry (has the real
 * table name and, where the primary key isn't a plain `id` column, its
 * pkColumn/composite shape) -- reused here rather than duplicated,
 * because it already has to be correct for rollback to work at all.
 * Fails closed (returns false) on an unknown domain shape or a missing
 * targetId, rather than assuming presence.
 */
async function verifyTargetRowExists(pgClient, spec, targetId) {
  if (!spec || !targetId) return false;
  if (spec.composite) {
    let a, b;
    try {
      [a, b] = decodeCompositeTargetId(targetId);
    } catch {
      return false; // fails closed on a malformed/legacy composite target_id, same as before
    }
    if (!a || !b) return false;
    const r = await pgClient.query(
      `SELECT 1 FROM ${spec.table} WHERE ${spec.composite[0]} = $1 AND ${spec.composite[1]} = $2 LIMIT 1`,
      [a, b]
    );
    return r.rowCount > 0;
  }
  const r = await pgClient.query(`SELECT 1 FROM ${spec.table} WHERE ${spec.pkColumn ?? 'id'} = $1 LIMIT 1`, [targetId]);
  return r.rowCount > 0;
}

async function migrateDomain(domainName, { dryRun, resetCheckpoint, pgClient }) {
  const domain = DOMAINS[domainName];
  if (!domain) throw new Error(`Unknown domain: ${domainName}`);

  const { file: checkpointFile, data: checkpointRaw } = loadCheckpoint(domainName);
  const checkpoint = resetCheckpoint ? {} : checkpointRaw;

  console.log(`\n[${domainName}] exporting from Mongo...`);
  const mongoDocs = await domain.export();
  console.log(`[${domainName}] exported ${mongoDocs.length} document(s) (content not logged)`);

  // Only built when a domain actually needs it (loadUserEmailMap does one
  // Mongo query and caches the result across every domain in this run).
  const ctx = { pgClient, userEmailMap: domain.needsUserMap ? await loadUserEmailMap() : null };
  if (domain.needsPlanCatalog) {
    if (!dryRun) await ensureMigrationSeedAdmin(pgClient);
    ctx.planSlugToId = dryRun ? null : await seedCanonicalPlans(pgClient, { withImpersonatedAdmin });
    ctx.resolvePlanSlug = resolvePlanSlug;
  }

  let imported = 0;
  let skippedUnchanged = 0;
  let failed = 0;

  for (const doc of mongoDocs) {
    const sourceId = String(doc._id);
    let ledgerId = null;
    try {
      const row = await domain.transform(doc, ctx);
      domain.validate(row);
      const contentHash = hashOf(row);
      const fullHash = contentHashOf(row);
      const spec = ROLLBACK_SPEC[domainName];

      // Stage 2J-B Part H fix (review round 2): a ledger row is ONLY ever
      // treated as "nothing to do" when it is FULLY reconciled -- status
      // 'planned' (markPlanned ran, but the target write may never have
      // happened) or 'created' (the write happened, but this process
      // crashed before independently re-verifying it) must ALWAYS fall
      // through and be (re-)processed, never silently counted as
      // unchanged. And even 'reconciled' is not trusted blindly: the
      // target row's actual PRESENCE is independently re-verified via
      // verifyTargetRowExists() (never inferred from the ledger's own
      // target_id column alone) before anything is skipped.
      //
      // Separately -- and regardless of whether we end up skipping --
      // if the ledger already points at a target row that genuinely
      // still exists, that pgId MUST be reused for the upsert below
      // (never a second INSERT). This is what makes resuming a crash
      // between the target write and markCreated/markReconciled safe: a
      // fresh forward run finds the same row (via the ledger, even with
      // NO local checkpoint at all) and UPDATEs it in place instead of
      // creating a duplicate.
      let resumeTargetId = null;
      let ledgerEntryExists = false;
      if (!dryRun) {
        const existing = await findLedgerEntry(pgClient, {
          sourceDatabase: SOURCE_DATABASE,
          sourceCollection: domainName,
          sourceDocumentId: sourceId,
          targetTable: domain.targetTable,
        });
        ledgerEntryExists = !!existing;

        if (existing && existing.target_id) {
          const stillThere = await verifyTargetRowExists(pgClient, spec, existing.target_id);
          if (stillThere) resumeTargetId = existing.target_id;
        }

        if (
          existing &&
          existing.source_content_hash === fullHash &&
          existing.status === 'reconciled' &&
          resumeTargetId
        ) {
          // PR #70 review round 11, item 2: "reconciled" + "the target row
          // still exists" was, until now, treated as sufficient proof the
          // target's CONTENT still matches what this migration itself
          // wrote -- it is not. The target row's existence says nothing
          // about whether something else (a trigger, a manual edit, a
          // different process entirely) mutated one of its columns out of
          // band since the last time this migration verified it. Every
          // OTHER path to markReconciled() in this file already requires a
          // real, content-comparing verifyReadBack() first (round 9/10,
          // item 5/1/2) -- this fast path was the one place a document
          // could still be silently re-reported as "unchanged" without
          // that same check. Fixed: the exact same exact read-back a fresh
          // write gets, before this document is allowed to be skipped.
          const fastPathReadBack = await verifyReadBack(pgClient, spec, resumeTargetId, row, { exemptFields: row.__generatedFields ?? [] });
          if (fastPathReadBack.ok) {
            skippedUnchanged += 1;
            checkpoint[sourceId] = { pgId: resumeTargetId, hash: contentHash, migratedAt: new Date().toISOString() };
            continue;
          }
          // Content has drifted out of band since this was last reconciled
          // -- never silently skip, never re-report as unchanged/
          // reconciled. Fails this document exactly like any other real
          // read-back failure (never auto-"fixed" by silently re-writing
          // it): mark the EXISTING ledger row failed, count it in
          // `failed`, non-zero exit -- an operator must look at this, the
          // same discipline this file already applies to every other
          // integrity mismatch it detects.
          ledgerId = existing.id;
          throw new Error(fastPathReadBack.reason);
        }
      }

      if (dryRun) {
        console.log(`[${domainName}] DRY-RUN would upsert sourceId=${sourceId} hash=${contentHash}`);
        imported += 1;
        continue;
      }

      if (resumeTargetId) {
        checkpoint[sourceId] = { ...(checkpoint[sourceId] ?? {}), pgId: resumeTargetId };
      } else if (ledgerEntryExists) {
        // PR #70 review round 9, item 5 follow-up: the ledger is the
        // authoritative source of truth for resume (same principle this
        // file's own rollback path already relies on) -- if a ledger row
        // exists for this exact source document but its target_id did NOT
        // verify as a real, still-existing row above (deleted out-of-band,
        // or a prior run's read-back failure after a same-transaction
        // self-delete -- see resume-rollback-integrity.test.mjs's item 5
        // "trigger that deletes the row" test), any STALE pgId a prior
        // run's LOCAL checkpoint file left behind for this sourceId must
        // never be trusted either. Without this, a domain adapter whose
        // upsert() consults `checkpoint[sourceId]?.pgId` directly (e.g.
        // trial_requests') would blindly UPDATE a target_id that no
        // longer exists -- affecting 0 rows, throwing nothing, and
        // returning that same dead id as if it were a real resume. Read-
        // back would then correctly re-fail with "no row found" forever,
        // since nothing ever forced a fresh INSERT.
        delete checkpoint[sourceId];
      }

      ledgerId = await markPlanned(pgClient, {
        sourceDatabase: SOURCE_DATABASE, sourceCollection: domainName, sourceDocumentId: sourceId,
        targetTable: domain.targetTable, contentHash: fullHash,
      });
      // Kill-window 1: crash after the ledger records intent, before the
      // target table is ever written. On resume, findLedgerEntry() above
      // sees status='planned' (never 'reconciled') -- never skipped, and
      // resumeTargetId stays null (no target_id was ever recorded), so
      // the document is processed as if starting fresh.
      throwIfFaultStage('after_ledger_planned_before_target_write');

      // Kill-window 2 (review round 2): the target write and markCreated()
      // are now ONE transaction, not two separate steps with a gap
      // between them. This is a real fix, not just a tested-around gap:
      // most domains' target tables have no natural key tying a row back
      // to its Mongo source document, so a crash strictly BETWEEN "the
      // row was written" and "the ledger was told its id" would have left
      // a genuinely un-trackable orphan row -- a resume with no local
      // checkpoint (findLedgerEntry() sees target_id=null, since
      // markCreated never ran) would then call upsert() again and INSERT
      // a duplicate, because nothing recorded the first row's id anywhere
      // durable. Wrapping the two together makes that window impossible
      // to observe: either both committed together (row exists, ledger
      // says 'created') or neither did (row does not exist -- the target
      // write itself rolls back with the transaction; the ledger's
      // 'planned' row from markPlanned above is a separate, already-
      // committed statement, so it survives and the outer catch below
      // marks it 'failed', which the tightened resume check treats
      // exactly like 'planned' -- never skipped, never trusted as having
      // a target row). Proven, not assumed: the kill-window test injects
      // the fault INSIDE this transaction and confirms the target row
      // genuinely does not exist afterward.
      let pgId;
      try {
        await pgClient.query('BEGIN');
        pgId = await domain.upsert(pgClient, sourceId, row, checkpoint);
        // Review round 3: resumeTargetId is now an ENFORCED adapter
        // contract, not an optional checkpoint convention some domains
        // happened to honor (via checkpoint[sourceId]?.pgId or a natural
        // ON CONFLICT key) and two plain-INSERT domains (notifications,
        // system_audit_logs) silently did not. This check applies to
        // EVERY domain, structurally, so a future domain making the same
        // mistake is caught here too, not just the two fixed this round.
        // If the id upsert() actually returned does not match a known-
        // existing resumeTargetId, that domain ignored it and inserted a
        // fresh row -- caught HERE, before COMMIT, so the throw below
        // rolls back the whole transaction, including that erroneous
        // INSERT: a duplicate can never actually land, not even
        // transiently.
        if (resumeTargetId && String(pgId) !== String(resumeTargetId)) {
          throw new Error(
            `CONTRACT VIOLATION: ${domainName}.upsert() ignored resumeTargetId (${resumeTargetId}) ` +
            `and returned a different id (${pgId}) -- this domain's adapter must reuse an existing ` +
            `target row on resume, never insert a duplicate`
          );
        }
        throwIfFaultStage('after_target_write_before_marked_created');
        await markCreated(pgClient, ledgerId, pgId);
        await pgClient.query('COMMIT');
      } catch (err) {
        await pgClient.query('ROLLBACK').catch(() => {});
        throw err;
      }
      checkpoint[sourceId] = { pgId, hash: contentHash, migratedAt: new Date().toISOString() };

      // Kill-window 3: crash after the target write AND markCreated have
      // both committed together (status='created', target_id set), before
      // the INDEPENDENT re-verification that promotes it to 'reconciled'
      // -- this one is deliberately never folded into the transaction
      // above (this file never claims false atomicity between a write and
      // an independent post-hoc check of it, same principle
      // production-import-orchestrator.mjs's own header states for its
      // GoTrue/Postgres boundary). On resume, status='created' is never
      // treated as unchanged (per the tightened check above) -- the
      // document is re-processed, resumeTargetId correctly reuses the
      // same committed row (no duplicate), and markReconciled() finally
      // runs.
      throwIfFaultStage('after_marked_created_before_reconciled');

      // PR #70 review round 9, item 5: this comment used to describe an
      // "INDEPENDENT re-verification" that did not actually exist --
      // markReconciled() was called directly, with no read-back at all.
      // Fixed: verifyReadBack() re-reads the real row by its real
      // identity (spec, above) and compares every field `row` itself
      // carries against what Postgres actually persisted -- not just
      // that SOME row with this id exists, but that its important
      // content genuinely matches what this migration wrote. A mismatch
      // (a trigger silently rewriting a value, the row having vanished
      // by the time this runs, anything) is treated exactly like any
      // other real failure: markFailed(), never markReconciled(), and
      // this document counts toward `failed` (a non-zero exit).
      //
      // Round 10, item 1: `row.__generatedFields`, when a domain's own
      // transform()/validate() set it, names EXACTLY the fields THIS
      // document's source genuinely had no original value for (a real
      // `?? new Date()` fallback fired) -- passed as `exemptFields` so
      // read-back skips ONLY those fields' VALUE comparison, never a
      // blanket per-TYPE exemption for every timestamp. A field the
      // source DID carry a real value for is always compared exactly.
      //
      // Round 11: routed through the shared verifyThenReconcile() (lib/
      // reconcile.mjs) -- markReconciled() is no longer called directly
      // anywhere in this file; see that module's own header for why.
      const reconcileResult = await verifyThenReconcile(pgClient, ledgerId, [
        { spec, targetId: pgId, expectedFields: row, options: { exemptFields: row.__generatedFields ?? [] } },
      ]);
      if (!reconcileResult.ok) throw new Error(reconcileResult.reason);
      imported += 1;
    } catch (err) {
      failed += 1;
      if (ledgerId) await markFailed(pgClient, ledgerId, err.message).catch(() => {});
      console.error(`[${domainName}] FAILED sourceId=${sourceId}: ${err.message}`);
    }

    // Checkpoint after every record — a kill -9 mid-run loses at most the
    // record in flight, not the whole batch (resumability). This file is
    // now a fast local cache ON TOP OF the DB-side ledger above, never
    // the sole source of truth for idempotency.
    if (!dryRun) saveCheckpoint(checkpointFile, checkpoint);
  }

  const pgCount = dryRun ? null : await domain.countPg(pgClient);

  console.log(
    `[${domainName}] done: mongo=${mongoDocs.length} imported=${imported} unchanged=${skippedUnchanged} failed=${failed}` +
      (pgCount !== null ? ` postgresRowCount=${pgCount}` : ' (dry-run, no write)')
  );

  return {
    domain: domainName,
    mongoCount: mongoDocs.length,
    imported,
    skippedUnchanged,
    failed,
    postgresRowCount: pgCount,
  };
}

async function main() {
  const args = parseStrictCliArgs(process.argv.slice(2), CLI_SPEC);
  validateCliArgs(args);

  const mongoUri = process.env.MIGRATION_MONGO_URI;
  const pgUri = process.env.MIGRATION_DB_URL;
  if (!mongoUri || !pgUri) {
    throw new Error('MIGRATION_MONGO_URI and MIGRATION_DB_URL must both be set (local-only).');
  }
  // MIGRATION_MONGO_URI stays unconditionally local-only -- every stage of
  // this engagement's own operating plan requires the Mongo SOURCE to
  // always be a local, disposable, restored-from-backup copy, never the
  // real Atlas cluster directly (see this file's own header). Production
  // Enablement never touches this check.
  assertLocalHost(mongoUri, 'MIGRATION_MONGO_URI');
  // MIGRATION_DB_URL (the Postgres/Supabase TARGET) may point at the real
  // production project ONLY when a genuine, independently-verified
  // production authorization is present -- see lib/production-
  // authorization.mjs's own header for exactly what that requires. Absent
  // MIGRATION_PRODUCTION_MODE=1, this behaves EXACTLY like the old
  // unconditional assertLocalHost() call it replaces.
  const productionAuthorization = loadAndVerifyProductionAuthorization();
  assertLocalHostOrProductionAuthorized(pgUri, 'MIGRATION_DB_URL', productionAuthorization);

  const requestedAll = args.domain === 'all' || !args.domain;
  const requestedRaw = requestedAll ? Object.keys(DOMAINS) : [args.domain];
  // Stage 2J-B Part H: lets a caller (the production orchestrator, or a
  // human operator) explicitly exclude one or more domains from an
  // otherwise-"all" run -- e.g. a domain deliberately DEFERRED_BY_PRODUCT_
  // DECISION -- without having to enumerate every OTHER domain by hand.
  // Only meaningful together with --domain=all; excluding a domain from a
  // single explicit --domain=<name> request makes no sense and is
  // rejected rather than silently ignored.
  const excludeList = args['exclude-domain']
    ? String(args['exclude-domain']).split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  for (const ex of excludeList) {
    if (!DOMAINS[ex]) throw new Error(`--exclude-domain references unknown domain: ${ex}`);
  }
  if (excludeList.length > 0 && !requestedAll) {
    throw new Error('--exclude-domain is only valid together with --domain=all (or no --domain at all)');
  }
  const requested = requestedRaw.filter((d) => !excludeList.includes(d));
  const dryRun = !!args['dry-run'];
  const resetCheckpoint = !!args['reset-checkpoint'];
  const rollback = !!args.rollback;

  console.log(`[migrate] mongo=${mongoUri.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`[migrate] postgres=${pgUri.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`[migrate] domains=${requested.join(',')} dryRun=${dryRun} resetCheckpoint=${resetCheckpoint} rollback=${rollback}`);
  if (excludeList.length > 0) console.log(`[migrate] excluded domains (not touched this run): ${excludeList.join(',')}`);

  // Rollback only ever reads its own checkpoint files and deletes from
  // Postgres — it never needs Mongo (the source data isn't touched by any
  // operation this tool performs), so the connection is skipped entirely.
  if (!rollback) await mongoose.connect(mongoUri);
  const pool = new pg.Pool({ connectionString: pgUri });
  const pgClient = await pool.connect();

  const results = [];
  try {
    for (const domainName of requested) {
      results.push(
        rollback
          ? await rollbackDomain(domainName, { pgClient })
          : await migrateDomain(domainName, { dryRun, resetCheckpoint, pgClient })
      );
    }
  } finally {
    pgClient.release();
    await pool.end();
    if (!rollback) await mongoose.disconnect();
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, `migration-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), dryRun, results }, null, 2));
  console.log(`\n[migrate] report written to ${reportPath}`);

  // Stage 2J-B Part H fix: per-document failures inside migrateDomain()'s
  // own try/catch were previously only ever logged (console.error) and
  // counted in that domain's `failed` field -- never propagated to this
  // process's own exit code, which stayed 0 as long as nothing THREW.
  // A caller that only checks the exit code (exactly what
  // production-import-orchestrator.mjs's runWorker()/domainResult.code
  // does, despite its own header comment claiming it "stops on the FIRST
  // domain that reports any failure") would see success even when EVERY
  // document in a domain failed to migrate -- confirmed for real this
  // round: --domain=payments against the actual dump reported
  // "failed=15" for all 15 real payment records (unsupported gateway
  // "paymob") yet exited 0. Any domain with failed > 0 now makes this
  // process exit non-zero, so a failure can never be silently swallowed
  // by a caller that only checks the exit code.
  const failedDomains = results.filter((r) => (r.failed ?? 0) > 0);
  if (failedDomains.length > 0) {
    console.error(
      `[migrate] FAILED: ${failedDomains.length} domain(s) had document-level failures: ` +
        failedDomains.map((r) => `${r.domain}(${r.failed})`).join(', ')
    );
    process.exitCode = 1;
  }
}

// PR #70 review round 8, item 1 -- discovered while adding CLI_SPEC/
// validateCliArgs() live tests: this file had no entrypoint guard at all
// (unlike migrate-users-to-supabase-auth.mjs and production-import-
// orchestrator.mjs, both already guarded for exactly this reason), so a
// plain `import { CLI_SPEC } from './mongo-to-supabase.mjs'` unconditionally
// ran the REAL main() as a side effect of import -- in an environment
// where MIGRATION_MONGO_URI/MIGRATION_DB_URL happened to be set, merely
// importing this module for testing would have opened a real Mongo/
// Postgres connection. Fixed the same way as the other two entrypoints:
// main() only runs when this file is executed directly (process.argv[1]
// is this file's own path), never as a side effect of import. Every
// live/integration test still drives this script via child-process CLI
// invocation, which is unaffected (process.argv[1] equals this file's own
// path in that case, same as before).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[migrate] FATAL:', err.message);
    process.exitCode = 1;
  });
}
