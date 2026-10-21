// `pnpm run test:prerender`: the tests that read the built site (dist/public),
// run after `pnpm run build`. REQUIRE_PRERENDER_DIST=1 makes each of them fail,
// rather than skip, when the build is missing, partial or stale
// (src/test/utils/builtDist.js). src/test/prerenderTestFiles.test.js keeps
// this list equal to the set of test files that read dist/public.
//
// Every listed file must pass at least one test, and any skipped test fails
// the run (scripts/vitestReport.mjs): a dist block that still skips here, such
// as one gated on a page that was not prerendered, would otherwise pass unseen.
import { pathToFileURL } from 'node:url';
import { finish, runVitest } from './vitestReport.mjs';

export const PRERENDER_TEST_FILES = [
  'src/test/frenchP2ContentMetadata.test.jsx',
  'src/test/italianInternalLinks.test.jsx',
  'src/test/italianMetadataLongPages.test.jsx',
  'src/test/italianMetadataRemainingPages.test.jsx',
  'src/test/italianMetadataShortPages.test.jsx',
  'src/test/italianPrivacyGa4.test.jsx',
  'src/test/italianTajweedChecker.test.jsx',
  'src/test/prerenderOutput.test.js',
  'src/test/socialAndSchemaAccuracy.test.jsx',
  'src/test/spaShell.test.js',
  'src/test/trustBarSupportStatus.test.jsx',
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = runVitest(PRERENDER_TEST_FILES, { args: process.argv.slice(2), env: { REQUIRE_PRERENDER_DIST: '1' } });
  process.exit(finish('test:prerender', run, { expectFiles: PRERENDER_TEST_FILES }));
}
