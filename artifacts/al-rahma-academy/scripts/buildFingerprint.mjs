// Build freshness stamp (2026-10-15).
//
// prerender.mjs writes dist/prerender-stamp.json as its very last step,
// recording a fingerprint of every input the built site comes from. The
// tests that read dist/public compare that stamp with the current tree, so
// they only ever assert against a build made from THIS checkout, after the
// prerender finished. A missing, partial or stale dist is reported as such
// (and fails outright under REQUIRE_PRERENDER_DIST=1, as in CI) instead of
// being read as if it were current.
//
// The stamp lives in dist/, not dist/public/, so it is never deployed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DIST_PUBLIC = join(appRoot, 'dist', 'public');
export const STAMP_FILE = join(appRoot, 'dist', 'prerender-stamp.json');

// What the built site is made from. src/test is left out: tests never ship.
const INPUT_FILES = ['index.html', 'package.json', 'vite.config.ts'];
const INPUT_DIRS = ['src', 'public', 'scripts'];
const EXCLUDED_DIRS = [join('src', 'test')];

function walk(dir, out) {
  for (const entry of readdirSync(join(appRoot, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(rel)) walk(rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

export function buildFingerprint() {
  const files = [...INPUT_FILES];
  for (const dir of INPUT_DIRS) walk(dir, files);
  const hash = createHash('sha256');
  for (const rel of files.map((f) => f.split(sep).join('/')).sort()) {
    hash.update(rel).update('\0');
    // Line endings normalised so a Windows checkout and CI agree.
    hash.update(readFileSync(join(appRoot, rel)).toString('latin1').replace(/\r\n/g, '\n')).update('\0');
  }
  return hash.digest('hex');
}

// { ready: true } only when dist/public exists, the prerender completed, and
// it was built from the current inputs. Otherwise `reason` says which.
export function builtDistStatus() {
  if (!existsSync(DIST_PUBLIC)) return { ready: false, reason: 'dist/public is missing' };
  if (!existsSync(STAMP_FILE)) return { ready: false, reason: 'dist/public has no prerender stamp (prerender did not finish, or the build predates stamps)' };
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(STAMP_FILE, 'utf8'));
  } catch {
    return { ready: false, reason: 'dist/prerender-stamp.json is unreadable' };
  }
  if (stamp.fingerprint !== buildFingerprint()) {
    return { ready: false, reason: `dist/public is stale (built ${stamp.builtAt ?? 'at an unknown time'} from different sources)` };
  }
  return { ready: true, reason: '' };
}

export function stampFor(pages) {
  return { fingerprint: buildFingerprint(), pages, builtAt: new Date().toISOString() };
}
