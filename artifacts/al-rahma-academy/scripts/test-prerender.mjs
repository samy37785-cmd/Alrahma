// `pnpm run test:prerender`: the tests that read the built site (dist/public),
// run after `pnpm run build`. REQUIRE_PRERENDER_DIST=1 makes each of them fail,
// rather than skip, when the build is missing, partial or stale
// (src/test/utils/builtDist.js). src/test/prerenderTestFiles.test.js keeps
// this list equal to the set of test files that read dist/public.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync('npx', ['vitest', 'run', ...PRERENDER_TEST_FILES, ...process.argv.slice(2)], {
    cwd: appRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, REQUIRE_PRERENDER_DIST: '1' },
  });
  process.exit(result.status ?? 1);
}
