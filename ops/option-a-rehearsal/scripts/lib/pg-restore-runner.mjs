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

// `pgEnv` (default {}): PG* libpq environment variables (PGHOST/PGPORT/
// PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE/PGSSLROOTCERT) — NEVER a
// connection-string argument. This is Stage 2D "Final Three-Gate
// Closure" item 2: a connection-string argument (even redacted
// afterward) still exists, briefly, in this process's own argv — visible
// to anything that can read `/proc/<pid>/cmdline` or a process listing
// on the same host while pg_restore runs, which redaction (a
// post-failure string scrub) cannot retroactively hide. Passing
// everything through the environment instead means no credential is
// EVER a command-line argument in the first place — redaction stays
// below as defense-in-depth for anything this file didn't anticipate,
// not as the primary control.
//
// For the "path" kind (host-installed binary), `env` on execFileAsync
// is enough: the child process reads PG* the same way psql/pg_restore
// always have. For the Docker fallback, secret VALUES must not become
// `docker run` ARGUMENTS either (that would just move the same leak from
// pg_restore's argv to docker's) — so docker is given bare `-e VARNAME`
// flags (name only, no `=value`), which tells docker to copy that
// variable's CURRENT VALUE from ITS OWN environment (set via this same
// `env` option) into the container. The value is never written into
// dockerArgs, so it can never appear in error.cmd/error.stack either.
export async function runClientTool(tool, args, bindMountDir, pgEnv = {}) {
  try {
    const env = { ...process.env, ...pgEnv };
    if (tool.kind === "path") {
      return await execFileAsync(tool.bin, args, { maxBuffer: 1024 * 1024 * 256, env });
    }
    const dockerArgs = [
      "run", "--rm",
      "--add-host=host.docker.internal:host-gateway",
      "-v", `${path.resolve(bindMountDir)}:/data`,
      ...Object.keys(pgEnv).flatMap((name) => ["-e", name]),
      "postgres:17", tool.bin,
      ...args.map((a) => (path.resolve(a).startsWith(path.resolve(bindMountDir)) ? `/data/${path.basename(a)}` : a)),
    ];
    return await execFileAsync("docker", dockerArgs, { maxBuffer: 1024 * 1024 * 256, env });
  } catch (e) {
    throw redactSecretsFromError(e);
  }
}

// Parses a postgres connection URL into libpq's own PG* environment
// variable names — never returns anything shaped like a connection
// string or bearing a password in a way meant to be passed as a CLI
// argument. See runClientTool's own comment for why this exists: an
// argument is visible in this process's argv for as long as the child
// runs; an environment variable is not.
export function pgEnvFromUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    PGUSER: decodeURIComponent(u.username || ""),
    PGPASSWORD: decodeURIComponent(u.password || ""),
  };
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
// Docker-fallback invocation needs PGHOST rewritten to
// host.docker.internal (same technique restore-bundle.mjs already uses
// for its own, separate, local-only Docker fallback). The production
// rollback orchestrator never passes this: Phase 0 already refuses
// every local host, and a real Supabase hostname is reachable
// unchanged from inside a container, nothing to rewrite.
//
// `caCertFile` (default undefined, so local tests — which run against a
// plaintext local Postgres with no CA of its own — are unaffected):
// production-rollback-orchestrator.mjs passes its own --ca-cert-file
// here so pg_restore's connection is forced to PGSSLMODE=verify-full
// against Supabase's real CA (via PGSSLROOTCERT) rather than the
// unverified encrypt-only connection it used before. Under the Docker
// fallback the CA file is copied into bundleDir (the only directory
// bind-mounted into the container) and referenced as /data/... instead
// of its host path.
export async function restorePublicSchemaDump(databaseUrl, bundleDir, { forLocalTestTarget = false, caCertFile } = {}) {
  const pgRestore = await resolveClientTool("pg_restore");
  const pgEnv = pgEnvFromUrl(databaseUrl);
  if (forLocalTestTarget && pgRestore.kind === "docker") {
    pgEnv.PGHOST = "host.docker.internal";
  }

  const dumpPath = path.join(bundleDir, "public_schema.dump");
  const { stdout: tocText } = await runClientTool(pgRestore, ["--list", dumpPath], bundleDir);
  const tocPath = path.join(bundleDir, ".rollback-toc.filtered.txt");
  fs.writeFileSync(tocPath, filterRestoreToc(tocText));

  let caCertCopyPath = null;
  if (caCertFile) {
    pgEnv.PGSSLMODE = "verify-full";
    if (pgRestore.kind === "docker") {
      caCertCopyPath = path.join(bundleDir, ".rollback-ca.pem");
      fs.copyFileSync(caCertFile, caCertCopyPath);
      pgEnv.PGSSLROOTCERT = "/data/.rollback-ca.pem";
    } else {
      pgEnv.PGSSLROOTCERT = path.resolve(caCertFile).replace(/\\/g, "/");
    }
  }

  try {
    await runClientTool(
      pgRestore,
      ["--dbname", pgEnv.PGDATABASE, "--exit-on-error", "--single-transaction", "--use-list", tocPath, dumpPath],
      bundleDir,
      pgEnv
    );
  } finally {
    fs.rmSync(tocPath, { force: true });
    if (caCertCopyPath) fs.rmSync(caCertCopyPath, { force: true });
  }
}
