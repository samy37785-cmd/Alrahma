// `pnpm run test:layout`: the real-browser layout tests (src/test/*.layout.test.js),
// run after `pnpm run build` and `npx playwright install chromium`.
//
// The files are found here, not listed by hand. CI used to name them in the
// workflow, and whatsappFabPhones.layout.test.js (added later) was never in that
// list: it skipped in the browser-less unit step and ran nowhere.
//
// REQUIRE_CHROMIUM=1 makes a missing browser an error (src/test/utils/launchChromium.js).
// Waves 3-5 test the built site, so a missing, unfinished or stale build fails
// before any test starts. Any skipped test fails the run (scripts/vitestReport.mjs).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtDistStatus } from './buildFingerprint.mjs';
import { APP_ROOT, finish, runVitest } from './vitestReport.mjs';

export const isLayoutTestFile = (name) => /\.layout\.test\.[cm]?[jt]sx?$/.test(name);

export const LAYOUT_TEST_FILES = readdirSync(join(APP_ROOT, 'src', 'test'))
  .filter(isLayoutTestFile)
  .sort()
  .map((name) => `src/test/${name}`);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ready, reason } = builtDistStatus();
  if (!ready) {
    console.error(`[test:layout] ${reason}: run \`pnpm run build\` first`);
    process.exit(1);
  }
  const run = runVitest(LAYOUT_TEST_FILES, { args: process.argv.slice(2), env: { REQUIRE_CHROMIUM: '1' } });
  process.exit(finish('test:layout', run, { expectFiles: LAYOUT_TEST_FILES }));
}
