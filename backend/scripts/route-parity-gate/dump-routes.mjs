#!/usr/bin/env node
// Boots the real Express app (module import — exercises the actual mount
// graph in app.js, not a hand-maintained list of route files) under
// whatever DATA_BACKEND is already set in this process's environment, and
// writes every {method, path} pair express-list-endpoints can find to
// --out. Run as a separate child process per backend (route-parity-
// gate.mjs's job) because DATA_BACKEND is read at module-import time
// throughout the app — one process can only ever boot one backend.
import fs from 'node:fs';
import listEndpoints from 'express-list-endpoints';

const outArgIdx = process.argv.indexOf('--out');
const outPath = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : null;
if (!outPath) throw new Error('Usage: dump-routes.mjs --out <file>');

const { default: app } = await import('../../app.js');
const routes = listEndpoints(app);

const flat = [];
for (const r of routes) {
  for (const method of r.methods) {
    flat.push({ method, path: r.path });
  }
}
flat.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));

fs.writeFileSync(outPath, JSON.stringify(flat, null, 2));
console.log(`[dump-routes] ${flat.length} routes written to ${outPath}`);
