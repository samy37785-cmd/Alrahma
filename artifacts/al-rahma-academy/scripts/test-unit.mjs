// `pnpm run test:unit`: every vitest file, run before any build and without a
// browser (the "Frontend unit tests" CI step).
//
// Two kinds of test cannot run there and skip themselves: the blocks that read
// the built site (the files in scripts/test-prerender.mjs) and the real-browser
// layout tests (scripts/test-layout.mjs). Both run for real in later CI steps,
// which fail on any skip. A skipped or todo test in any other file fails this
// step, so nothing can skip in CI without a later step that runs it.
import { pathToFileURL } from 'node:url';
import { LAYOUT_TEST_FILES } from './test-layout.mjs';
import { PRERENDER_TEST_FILES } from './test-prerender.mjs';
import { finish, runVitest } from './vitestReport.mjs';

export const SKIPS_ALLOWED_IN = [...PRERENDER_TEST_FILES, ...LAYOUT_TEST_FILES];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = runVitest([], { args: process.argv.slice(2) });
  process.exit(finish('test:unit', run, { allowSkipIn: SKIPS_ALLOWED_IN }));
}
