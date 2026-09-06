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

export async function runClientTool(tool, args, bindMountDir) {
  if (tool.kind === "path") {
    return execFileAsync(tool.bin, args, { maxBuffer: 1024 * 1024 * 256 });
  }
  const dockerArgs = [
    "run", "--rm",
    "--add-host=host.docker.internal:host-gateway",
    "-v", `${path.resolve(bindMountDir)}:/data`,
    "postgres:17", tool.bin,
    ...args.map((a) => (path.resolve(a).startsWith(path.resolve(bindMountDir)) ? `/data/${path.basename(a)}` : a)),
  ];
  return execFileAsync("docker", dockerArgs, { maxBuffer: 1024 * 1024 * 256 });
}

function dockerRewriteUrl(url) {
  const u = new URL(url);
  u.hostname = "host.docker.internal";
  return u.toString();
}

// Restores bundleDir/public_schema.dump onto databaseUrl, filtering out
// the platform-owned `CREATE SCHEMA public` and `rls_auto_enable()`
// entries (same two exclusions restore-bundle.mjs proved necessary by
// actually running this against a real target — see its own comments).
// pg_restore's own `--single-transaction` is this step's atomicity
// boundary: a failure partway rolls back the ENTIRE restore, leaving
// the target exactly as it was before this call (see rollback-core.mjs
// for why this can't share a single Postgres transaction with the rest
// of the rollback run).
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
export async function restorePublicSchemaDump(databaseUrl, bundleDir, { forLocalTestTarget = false } = {}) {
  const pgRestore = await resolveClientTool("pg_restore");
  const effectiveUrl = forLocalTestTarget && pgRestore.kind === "docker" ? dockerRewriteUrl(databaseUrl) : databaseUrl;
  const dumpPath = path.join(bundleDir, "public_schema.dump");
  const { stdout: tocText } = await runClientTool(pgRestore, ["--list", dumpPath], bundleDir);
  const filteredToc = tocText
    .split("\n")
    .filter((line) => !/\bSCHEMA\s*-?\s*public\b/.test(line))
    .filter((line) => !/\bFUNCTION\s+public\s+rls_auto_enable\(/.test(line))
    .join("\n");
  const tocPath = path.join(bundleDir, ".rollback-toc.filtered.txt");
  fs.writeFileSync(tocPath, filteredToc);
  try {
    await runClientTool(pgRestore, ["--dbname", effectiveUrl, "--exit-on-error", "--single-transaction", "--use-list", tocPath, dumpPath], bundleDir);
  } finally {
    fs.rmSync(tocPath, { force: true });
  }
}
