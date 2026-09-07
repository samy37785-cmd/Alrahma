#!/usr/bin/env node
// Automated Route Parity Gate (Stage 2F item 3) — a standing, repeatable,
// CI-runnable check (no GitHub Actions exists in this repo to wire it into
// yet; this is the tool such a workflow would call). Two parts:
//
//  1. STRUCTURAL PARITY: boots the real app.js twice, once per
//     DATA_BACKEND, via express-list-endpoints (walks the actual mounted
//     Express router graph — not a hand-maintained list of route files, so
//     it can't silently drift out of date the way a checklist would).
//     Fails if any {method, path} registered under DATA_BACKEND=mongodb is
//     missing under DATA_BACKEND=supabase (a route that quietly has no
//     supabase counterpart at all).
//
//  2. LIVE SMOKE PASS under DATA_BACKEND=supabase: fires an unauthenticated
//     request at every enumerated route (skipping only routes whose path
//     contains a `:param` this script has no safe way to fabricate) and
//     flags:
//       - any 501 (explicit "not implemented")
//       - any /api/v1/admin/* route (other than the public /auth/* login
//         entry points) that returns 2xx with ZERO credentials — proof an
//         admin route is bypassing JWT/AAL2/RBAC
//       - any response whose body mentions Mongo/mongoose/ECONNREFUSED — a
//         leaked Mongo dependency under supabase mode
//     Everything else (400/401/403/404/409/422, or a 500 that isn't a
//     Mongo-signature) is not proof of a missing adapter on its own (most
//     routes need real seeded state a blind smoke test can't fabricate) —
//     recorded in the matrix for human review, not auto-failed. Deeper
//     per-domain business-logic correctness is covered by the existing,
//     much more thorough rehearsal-*.mjs suites in this same directory
//     tree; this gate's job is structural coverage + the three failure
//     classes named above, not a replacement for those.
//
// Usage: node scripts/route-parity-gate/route-parity-gate.mjs
// (see backend/package.json's "route-parity-gate" script for the exact
// required env vars)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '..', '..');

function dumpRoutes(dataBackend, extraEnv = {}) {
  const outFile = path.join(os.tmpdir(), `route-parity-${dataBackend}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'dump-routes.mjs'), '--out', outFile],
    {
      cwd: BACKEND_ROOT,
      env: { ...process.env, ...extraEnv, DATA_BACKEND: dataBackend },
      stdio: ['ignore', 'ignore', 'inherit'],
    }
  );
  const routes = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  fs.unlinkSync(outFile);
  return routes;
}

function key(r) {
  return `${r.method} ${r.path}`;
}

async function main() {
  console.log('[route-parity-gate] Enumerating routes under DATA_BACKEND=mongodb...');
  const mongoRoutes = dumpRoutes('mongodb');
  console.log(`[route-parity-gate] ${mongoRoutes.length} routes under mongodb.`);

  console.log('[route-parity-gate] Enumerating routes under DATA_BACKEND=supabase...');
  const supabaseRoutes = dumpRoutes('supabase');
  console.log(`[route-parity-gate] ${supabaseRoutes.length} routes under supabase.`);

  const mongoSet = new Set(mongoRoutes.map(key));
  const supabaseSet = new Set(supabaseRoutes.map(key));

  const missingUnderSupabase = mongoRoutes.filter((r) => !supabaseSet.has(key(r)));
  const supabaseOnly = supabaseRoutes.filter((r) => !mongoSet.has(key(r)));

  const failures = [];
  const matrix = [];

  for (const r of missingUnderSupabase) {
    failures.push(`STRUCTURAL: ${key(r)} exists under mongodb but has NO route at all under supabase.`);
  }

  // --- Live smoke pass, in-process, under DATA_BACKEND=supabase ---
  console.log('[route-parity-gate] Running live smoke pass under DATA_BACKEND=supabase...');
  process.env.DATA_BACKEND = 'supabase';
  const { default: app } = await import(pathToFileURL(path.join(BACKEND_ROOT, 'app.js')));

  const ADMIN_PUBLIC_PREFIX = '/api/v1/admin/auth';
  const MONGO_SIGNATURE = /Mongo|mongoose|ECONNREFUSED.*27017|MongooseError/i;

  for (const r of supabaseRoutes) {
    if (r.path.includes(':') || r.path.includes('*')) {
      matrix.push({ ...r, verdict: 'SKIP', reason: 'dynamic path segment — no safe fabricated value' });
      continue;
    }

    const method = r.method.toLowerCase();
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      matrix.push({ ...r, verdict: 'SKIP', reason: `unsupported method for smoke pass: ${r.method}` });
      continue;
    }

    let res;
    try {
      res = await request(app)[method](r.path).send({});
    } catch (err) {
      matrix.push({ ...r, verdict: 'FAIL', reason: `request threw: ${err.message}` });
      failures.push(`LIVE: ${key(r)} — request itself threw: ${err.message}`);
      continue;
    }

    const bodyText = JSON.stringify(res.body || {});
    const isAdminProtected = r.path.startsWith('/api/v1/admin') && !r.path.startsWith(ADMIN_PUBLIC_PREFIX);

    if (res.status === 501) {
      matrix.push({ ...r, verdict: 'FAIL', reason: '501 Not Implemented' });
      failures.push(`LIVE: ${key(r)} — returned 501.`);
    } else if (isAdminProtected && res.status >= 200 && res.status < 300) {
      matrix.push({ ...r, verdict: 'FAIL', reason: `admin route returned ${res.status} with ZERO credentials (RBAC/JWT/AAL2 bypass)` });
      failures.push(`LIVE: ${key(r)} — admin route accepted an unauthenticated request (status ${res.status}).`);
    } else if (MONGO_SIGNATURE.test(bodyText)) {
      matrix.push({ ...r, verdict: 'FAIL', reason: `Mongo-signature leaked under supabase mode: ${bodyText.slice(0, 200)}` });
      failures.push(`LIVE: ${key(r)} — Mongo dependency leaked under DATA_BACKEND=supabase.`);
    } else {
      matrix.push({ ...r, verdict: 'PASS', reason: `status ${res.status}`, status: res.status });
    }
  }

  // --- Report ---
  const reportPath = path.join(BACKEND_ROOT, 'scripts', 'route-parity-gate', 'last-run-report.md');
  const lines = [
    '# Route Parity Gate — last run',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- mongodb routes: ${mongoRoutes.length}`,
    `- supabase routes: ${supabaseRoutes.length}`,
    `- routes missing under supabase (structural failures): ${missingUnderSupabase.length}`,
    `- supabase-only routes (present under supabase, not mongodb): ${supabaseOnly.length}`,
    `- live smoke pass: ${matrix.filter((m) => m.verdict === 'PASS').length} PASS / ${matrix.filter((m) => m.verdict === 'FAIL').length} FAIL / ${matrix.filter((m) => m.verdict === 'SKIP').length} SKIP`,
    '',
    '## Route matrix (method, path, verdict, reason)',
    '',
    '| Method | Path | Verdict | Reason |',
    '|---|---|---|---|',
    ...matrix.map((m) => `| ${m.method} | ${m.path} | ${m.verdict} | ${m.reason} |`),
  ];
  if (supabaseOnly.length) {
    lines.push('', '## Supabase-only routes (informational, not a failure)', '', ...supabaseOnly.map((r) => `- ${key(r)}`));
  }
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`[route-parity-gate] Full matrix written to ${reportPath}`);

  if (failures.length) {
    console.error(`\n[route-parity-gate] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`\n[route-parity-gate] PASSED — zero structural gaps, zero 501s, zero admin-auth bypasses, zero leaked Mongo dependencies.`);
  }
}

main().catch((err) => {
  console.error('[route-parity-gate] FATAL:', err);
  process.exitCode = 1;
});
