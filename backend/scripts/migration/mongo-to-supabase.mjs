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
//   node mongo-to-supabase.mjs --domain=trial_requests|subscribers|blogs|all
//                               [--dry-run] [--reset-checkpoint]
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
import pg from 'pg';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_DIR = path.join(__dirname, '.checkpoints');
const OUT_DIR = path.join(__dirname, 'out');

function assertLocalHost(connectionString, label) {
  const host = new URL(connectionString).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: ${label} host "${host}" is not localhost/127.0.0.1.`);
  }
}

function hashOf(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
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

// --- Domain definitions: export shape (Mongo) -> transform -> import shape (Postgres) ---

const DOMAINS = {
  trial_requests: {
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
    async export() {
      const Blog = mongoose.connection.collection('blogs');
      return Blog.find({}).toArray();
    },
    transform(doc) {
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
      // NOTE: category/readTime/coverImage/seo.canonicalUrl have no Postgres
      // column — silently dropped here, matching the documented gap in
      // docs/option-a-mongo-supabase-parity-map.md ("Blog" section). This is
      // NOT a bug: there is nowhere to put them without a schema change.
    },
    validate(row) {
      if (!row.title || !row.slug || !row.content) throw new Error('blogs row missing title/slug/content');
      if (row.published && !row.published_at) row.published_at = new Date().toISOString();
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
};

async function migrateDomain(domainName, { dryRun, resetCheckpoint, pgClient }) {
  const domain = DOMAINS[domainName];
  if (!domain) throw new Error(`Unknown domain: ${domainName}`);

  const { file: checkpointFile, data: checkpointRaw } = loadCheckpoint(domainName);
  const checkpoint = resetCheckpoint ? {} : checkpointRaw;

  console.log(`\n[${domainName}] exporting from Mongo...`);
  const mongoDocs = await domain.export();
  console.log(`[${domainName}] exported ${mongoDocs.length} document(s) (content not logged)`);

  let imported = 0;
  let skippedUnchanged = 0;
  let failed = 0;

  for (const doc of mongoDocs) {
    const sourceId = String(doc._id);
    try {
      const row = domain.transform(doc);
      domain.validate(row);
      const contentHash = hashOf(row);

      if (checkpoint[sourceId]?.hash === contentHash) {
        skippedUnchanged += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[${domainName}] DRY-RUN would upsert sourceId=${sourceId} hash=${contentHash}`);
        imported += 1;
        continue;
      }

      const pgId = await domain.upsert(pgClient, sourceId, row, checkpoint);
      checkpoint[sourceId] = { pgId, hash: contentHash, migratedAt: new Date().toISOString() };
      imported += 1;
    } catch (err) {
      failed += 1;
      console.error(`[${domainName}] FAILED sourceId=${sourceId}: ${err.message}`);
    }

    // Checkpoint after every record — a kill -9 mid-run loses at most the
    // record in flight, not the whole batch (resumability).
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
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
  );

  const mongoUri = process.env.MIGRATION_MONGO_URI;
  const pgUri = process.env.MIGRATION_DB_URL;
  if (!mongoUri || !pgUri) {
    throw new Error('MIGRATION_MONGO_URI and MIGRATION_DB_URL must both be set (local-only).');
  }
  assertLocalHost(mongoUri, 'MIGRATION_MONGO_URI');
  assertLocalHost(pgUri, 'MIGRATION_DB_URL');

  const requested = args.domain === 'all' || !args.domain ? Object.keys(DOMAINS) : [args.domain];
  const dryRun = !!args['dry-run'];
  const resetCheckpoint = !!args['reset-checkpoint'];

  console.log(`[migrate] mongo=${mongoUri.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`[migrate] postgres=${pgUri.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`[migrate] domains=${requested.join(',')} dryRun=${dryRun} resetCheckpoint=${resetCheckpoint}`);

  await mongoose.connect(mongoUri);
  const pool = new pg.Pool({ connectionString: pgUri });
  const pgClient = await pool.connect();

  const results = [];
  try {
    for (const domainName of requested) {
      results.push(await migrateDomain(domainName, { dryRun, resetCheckpoint, pgClient }));
    }
  } finally {
    pgClient.release();
    await pool.end();
    await mongoose.disconnect();
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const reportPath = path.join(OUT_DIR, `migration-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), dryRun, results }, null, 2));
  console.log(`\n[migrate] report written to ${reportPath}`);
}

main().catch((err) => {
  console.error('[migrate] FATAL:', err.message);
  process.exitCode = 1;
});
