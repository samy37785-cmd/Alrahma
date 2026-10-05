// Manual IndexNow submission. NOT part of build, prerender or CI, and nothing calls it automatically.
//
//   node scripts/indexnow-submit.mjs --url https://al-rahmaacademy.com/it/tools/tajweed-checker
//   node scripts/indexnow-submit.mjs --file changed-urls.txt          (one URL per line)
//   node scripts/indexnow-submit.mjs --file changed-urls.txt --send   (actually sends)
//
// Without --send it is a dry run: it validates and prints what WOULD be sent and makes no network call.
// Only published canonical URLs on al-rahmaacademy.com are accepted (Preview/localhost/www/http, query
// strings, Spanish/German paths and unpublished routes are rejected). More than 50 URLs needs --all, so a
// full-site submission can never happen by accident. Output is counts and HTTP statuses only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_BATCH, MAX_WITHOUT_ALL, chunk, submit, validateUrls } from './indexnow-lib.mjs';

export function parseArgs(argv) {
  const opts = { urls: [], files: [], send: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') opts.urls.push(argv[++i]);
    else if (a === '--file') opts.files.push(argv[++i]);
    else if (a === '--send') opts.send = true;
    else if (a === '--all') opts.all = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export async function run(argv, { log = console.log, fetchImpl, readFile = (f) => readFileSync(f, 'utf8') } = {}) {
  const opts = parseArgs(argv);
  const candidates = [...opts.urls, ...opts.files.flatMap((f) => readFile(f).split(/\r?\n/))];
  if (candidates.every((c) => !String(c ?? '').trim())) {
    log('indexnow: no URLs given (use --url or --file)');
    return 2;
  }
  const { accepted, rejected, duplicates } = validateUrls(candidates);
  for (const r of rejected) log(`indexnow: rejected ${r.url} (${r.reason})`);
  log(`indexnow: ${accepted.length} URL(s) accepted, ${rejected.length} rejected, ${duplicates} duplicate(s) dropped, ${chunk(accepted).length} batch(es) of up to ${MAX_BATCH}`);
  if (rejected.length) return 2;
  if (accepted.length === 0) return 2;
  if (accepted.length > MAX_WITHOUT_ALL && !opts.all) {
    log(`indexnow: refusing to send more than ${MAX_WITHOUT_ALL} URLs without --all`);
    return 2;
  }
  if (!opts.send) {
    for (const u of accepted) log(`indexnow: would send ${u}`);
    log('indexnow: dry run (add --send to submit)');
    return 0;
  }
  const result = await submit(accepted, fetchImpl ? { fetchImpl } : {});
  result.batches.forEach((b, i) => log(`indexnow: batch ${i + 1}: ${b.urls} URL(s) -> ${b.status ?? b.error}`));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`indexnow: ${err.message}`); process.exitCode = 2; });
}
