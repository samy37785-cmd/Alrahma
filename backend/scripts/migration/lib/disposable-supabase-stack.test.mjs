#!/usr/bin/env node
// Pure/unit tests for lib/disposable-supabase-stack.mjs -- no Docker, no
// stack is started. Checks the rewrite against the real committed template.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickFreePorts, rewriteStackConfig, prepareIsolatedStack } from './disposable-supabase-stack.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'ops', 'stage2jb-r11-gotrue');
const TEMPLATE = fs.readFileSync(path.join(TEMPLATE_DIR, 'supabase', 'config.toml'), 'utf8');

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ok - ${name}`);
  } catch (err) {
    results.push({ name, pass: false, err });
    console.log(`  FAIL - ${name}\n    ${err.stack || err.message}`);
  }
}

await test('pickFreePorts: distinct ports, all below the Linux ephemeral range', async () => {
  const ports = await pickFreePorts(8);
  assert.equal(new Set(ports).size, 8);
  for (const p of ports) assert.ok(p >= 20000 && p <= 32767, `port ${p} outside 20000-32767`);
});

await test('rewriteStackConfig: every active port and the project_id are replaced; comments untouched', () => {
  const ports = [21001, 21002, 21003, 21004, 21005, 21006, 21007];
  const { text, assigned } = rewriteStackConfig(TEMPLATE, { projectId: 'unit-abc', ports });
  assert.match(text, /^project_id = "unit-abc"$/m);
  assert.doesNotMatch(text, /^project_id = "stage2jb-r11-gotrue"$/m);
  const active = text.split('\n').filter((l) => /^\s*(?:shadow_)?port\s*=\s*\d+\s*$/.test(l));
  assert.equal(active.length, ports.length, 'every active port line got a new value');
  for (const line of active) assert.ok(ports.includes(Number(line.split('=')[1])), `unreplaced: ${line}`);
  assert.equal(assigned['[api].port'], 21001);
  assert.equal(assigned['[db].port'], 21002);
  assert.equal(assigned['[db].shadow_port'], 21003);
  const comments = (t) => t.split('\n').filter((l) => /^\s*#/.test(l));
  assert.deepEqual(comments(text), comments(TEMPLATE), 'commented-out settings are left alone');
});

await test('rewriteStackConfig: refuses when there are fewer ports than port settings', () => {
  assert.throws(() => rewriteStackConfig(TEMPLATE, { projectId: 'x', ports: [21001] }), /not enough ports/);
});

await test('prepareIsolatedStack: a fresh workdir per call, unique project ids, removable', async () => {
  const a = await prepareIsolatedStack(TEMPLATE_DIR, { prefix: 'unit' });
  const b = await prepareIsolatedStack(TEMPLATE_DIR, { prefix: 'unit' });
  try {
    assert.notEqual(a.projectId, b.projectId);
    assert.notEqual(a.workdir, b.workdir);
    const written = fs.readFileSync(path.join(a.workdir, 'supabase', 'config.toml'), 'utf8');
    assert.match(written, new RegExp(`^project_id = "${a.projectId}"$`, 'm'));
    assert.equal(fs.readFileSync(path.join(TEMPLATE_DIR, 'supabase', 'config.toml'), 'utf8'), TEMPLATE, 'the template is never modified');
  } finally {
    a.remove();
    b.remove();
  }
  assert.equal(fs.existsSync(a.workdir), false);
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
