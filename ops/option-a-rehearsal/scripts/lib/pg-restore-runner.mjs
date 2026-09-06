// Shared pg_restore invocation for a production-target restore — same
// PATH-first/Docker-fallback discipline as restore-bundle.mjs (which
// stays untouched and local-only), factored out so the production
// rollback orchestrator and its tests exercise the exact SAME code
// rather than two hand-copies of it drifting apart over time.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function resolveClientTool(bin) {
  try {
    await execFileAsync(bin, ["--version"]);
    return { kind: "path", bin };
  } catch {
    console.log(`INFO  "${bin}" not found on PATH — falling back to a disposable Docker container for the binary only.`);
    return { kind: "docker", bin };
  }
}

// Node's execFile, on a non-zero exit, builds error.message/.cmd/.stack
// from the FULL invoked command line — confirmed by direct reproduction
// (a failing child process given a `postgresql://user:PASS@host` arg
// puts PASS in error.message, error.cmd, AND error.stack verbatim). Any
// pg_restore failure against a real target — this file's every caller —
// would therefore have printed the production database password to
// stdout/stderr the moment the caller's own top-level catch logs
// e.stack/e.message (exactly what production-rollback-orchestrator.mjs's
// `main().catch` does). Every error this file can throw is scrubbed
// before it ever leaves here — see test/pg-restore-runner.test.mjs's
// credential-redaction cases.
function redactConnectionStringSecrets(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(:\/\/[^:@/\s]+:)([^@/\s]+)(@)/g, "$1REDACTED$3");
}

export function redactSecretsFromError(e) {
  if (e && typeof e === "object") {
    for (const key of ["message", "cmd", "stack", "stdout", "stderr"]) {
      if (typeof e[key] === "string") e[key] = redactConnectionStringSecrets(e[key]);
    }
  }
  return e;
}

export async function runClientTool(tool, args, bindMountDir) {
  try {
    if (tool.kind === "path") {
      return await execFileAsync(tool.bin, args, { maxBuffer: 1024 * 1024 * 256 });
    }
    const dockerArgs = [
      "run", "--rm",
      "--add-host=host.docker.internal:host-gateway",
      "-v", `${path.resolve(bindMountDir)}:/data`,
      "postgres:17", tool.bin,
      ...args.map((a) => (path.resolve(a).startsWith(path.resolve(bindMountDir)) ? `/data/${path.basename(a)}` : a)),
    ];
    return await execFileAsync("docker", dockerArgs, { maxBuffer: 1024 * 1024 * 256 });
  } catch (e) {
    throw redactSecretsFromError(e);
  }
}

function dockerRewriteUrl(url) {
  const u = new URL(url);
  u.hostname = "host.docker.internal";
  return u.toString();
}

// Forces REAL certificate verification on pg_restore's OWN libpq
// connection — a gap the Stage 2D read-only audit disclosed but did not
// fix: libpq's sslmode=require means "encrypt only, don't verify the
// certificate" (unlike the Node pg driver's newer verify-full-alias
// behavior handled in lib/pg-connection.mjs), so pg_restore was
// connecting to production with NO certificate validation at all.
// sslrootcert must be a path pg_restore's OWN process can read — see
// restorePublicSchemaDump for how that differs between a PATH-installed
// binary (any host path) and the Docker fallback (only /data, the bind
// mount).
export function withStrictTls(url, sslrootcertPath) {
  const u = new URL(url);
  u.searchParams.set("sslmode", "verify-full");
  u.searchParams.set("sslrootcert", sslrootcertPath);
  return u.toString();
}

// Pure, independently testable: which TOC lines pg_restore is allowed
// to replay (see test/pg-restore-runner.test.mjs).
//   - `SCHEMA ... public` / `ACL - SCHEMA public` / `COMMENT ... SCHEMA
//     public` — the target's public schema already exists, owned by
//     pg_database_owner (confirmed live against production by the
//     Stage 2D read-only audit); recreating it isn't needed.
//   - `FUNCTION public rls_auto_enable()` — platform-owned, already
//     present on the target.
//   - `DEFAULT ACL ... supabase_admin` (3 entries in the real bundle:
//     TABLES/SEQUENCES/FUNCTIONS FOR ROLE supabase_admin IN SCHEMA
//     public) — the Stage 2D read-only audit confirmed live against
//     production that the connecting role (postgres) is NOT a member of
//     supabase_admin and CANNOT SET ROLE into it ("permission denied to
//     set role \"supabase_admin\""). `ALTER DEFAULT PRIVILEGES FOR ROLE
//     X` requires membership in X, so replaying these entries would
//     abort the whole --single-transaction restore with "permission
//     denied to change default privileges". They are default-privilege
//     REGISTRATIONS for FUTURE objects, not schema content being
//     restored — the target's real pg_default_acl rows for
//     supabase_admin already exist, untouched, independent of this
//     restore (see rollback-core.mjs's verifyDefaultAclUnchanged, which
//     proves exactly that after every rollback).
export function filterRestoreToc(tocText) {
  return tocText
    .split("\n")
    .filter((line) => !/\bSCHEMA\s*-?\s*public\b/.test(line))
    .filter((line) => !/\bFUNCTION\s+public\s+rls_auto_enable\(/.test(line))
    .filter((line) => !/\bDEFAULT ACL\b.*\bsupabase_admin\s*$/.test(line))
    .join("\n");
}

// Restores bundleDir/public_schema.dump onto databaseUrl through a
// filtered TOC (filterRestoreToc, above) — never the raw dump. pg_restore's
// own `--single-transaction` is this step's atomicity boundary: a
// failure partway rolls back the ENTIRE restore, leaving the target
// exactly as it was before this call (see rollback-core.mjs for why
// this can't share a single Postgres transaction with the rest of the
// rollback run).
//
// `forLocalTestTarget` (default false, production path unaffected):
// pass true ONLY from a local test pointed at 127.0.0.1 — a Docker
// container can't reach the test-runner's own loopback address, so the
// Docker-fallback invocation needs databaseUrl rewritten to
// host.docker.internal (same technique restore-bundle.mjs already uses
// for its own, separate, local-only Docker fallback). The production
// rollback orchestrator never passes this: Phase 0 already refuses
// every local host, and a real Supabase hostname is reachable
// unchanged from inside a container, nothing to rewrite.
//
// `caCertFile` (default undefined, so local tests — which run against a
// plaintext local Postgres with no CA of its own — are unaffected):
// production-rollback-orchestrator.mjs passes its own --ca-cert-file
// here so pg_restore's connection is forced to sslmode=verify-full
// against Supabase's real CA (withStrictTls, above) rather than the
// unverified encrypt-only connection it used before. Under the Docker
// fallback the CA file is copied into bundleDir (the only directory
// bind-mounted into the container) and referenced as /data/... instead
// of its host path.
export async function restorePublicSchemaDump(databaseUrl, bundleDir, { forLocalTestTarget = false, caCertFile } = {}) {
  const pgRestore = await resolveClientTool("pg_restore");
  const effectiveUrl = forLocalTestTarget && pgRestore.kind === "docker" ? dockerRewriteUrl(databaseUrl) : databaseUrl;
  const dumpPath = path.join(bundleDir, "public_schema.dump");
  const { stdout: tocText } = await runClientTool(pgRestore, ["--list", dumpPath], bundleDir);
  const tocPath = path.join(bundleDir, ".rollback-toc.filtered.txt");
  fs.writeFileSync(tocPath, filterRestoreToc(tocText));

  let restoreUrl = effectiveUrl;
  let caCertCopyPath = null;
  if (caCertFile) {
    if (pgRestore.kind === "docker") {
      caCertCopyPath = path.join(bundleDir, ".rollback-ca.pem");
      fs.copyFileSync(caCertFile, caCertCopyPath);
      restoreUrl = withStrictTls(restoreUrl, "/data/.rollback-ca.pem");
    } else {
      restoreUrl = withStrictTls(restoreUrl, path.resolve(caCertFile).replace(/\\/g, "/"));
    }
  }

  try {
    await runClientTool(pgRestore, ["--dbname", restoreUrl, "--exit-on-error", "--single-transaction", "--use-list", tocPath, dumpPath], bundleDir);
  } finally {
    fs.rmSync(tocPath, { force: true });
    if (caCertCopyPath) fs.rmSync(caCertCopyPath, { force: true });
  }
}
