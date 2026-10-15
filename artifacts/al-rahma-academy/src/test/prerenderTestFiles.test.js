import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRERENDER_TEST_FILES } from '../../scripts/test-prerender.mjs';

// Every test that reads the built site (dist/public) must (a) gate on a fresh,
// finished build through utils/builtDist.js, never a bare existsSync, and
// (b) be listed in scripts/test-prerender.mjs, which CI runs after the build
// with REQUIRE_PRERENDER_DIST=1. Otherwise a new dist test would only ever be
// skipped in CI (the plain vitest step runs before any build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');
const testDir = path.join(appRoot, 'src', 'test');

// The real-browser layout tests have their own post-build CI step and their
// own dist check.
const isLayoutTest = (rel) => rel.endsWith('.layout.test.js');
const READS_DIST = /['"`][^'"`\n]*dist\/public|['"]dist['"]\s*,\s*['"]public['"]/;
const USES_GATE = /from '\.\/utils\/builtDist'/;

const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => /\.test\.jsx?$/.test(f) && f !== path.basename(fileURLToPath(import.meta.url)))
  .map((f) => `src/test/${f}`);
const source = (rel) => fs.readFileSync(path.join(appRoot, rel), 'utf8');

describe('post-build test list (scripts/test-prerender.mjs)', () => {
  it('lists exactly the test files that read dist/public', () => {
    const readers = testFiles.filter((rel) => !isLayoutTest(rel) && READS_DIST.test(source(rel))).sort();
    expect([...PRERENDER_TEST_FILES].sort()).toEqual(readers);
  });

  it('every listed file gates its dist blocks on builtDistReady()', () => {
    for (const rel of PRERENDER_TEST_FILES) expect(USES_GATE.test(source(rel)), rel).toBe(true);
  });

  it('only listed files use the gate', () => {
    const gated = testFiles.filter((rel) => USES_GATE.test(source(rel))).sort();
    expect(gated).toEqual([...PRERENDER_TEST_FILES].sort());
  });
});
