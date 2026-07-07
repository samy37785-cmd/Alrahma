import { test } from 'node:test';
import assert from 'node:assert/strict';

// T23 (monitoring & observability audit): in production, Winston's
// exceptionHandlers/rejectionHandlers previously wrote ONLY to a local
// rotating file. Render (this project's deployment target) has no persistent
// disk configured, so that file never survives a restart and isn't otherwise
// retrievable — meaning an uncaught exception's detail was written somewhere
// that vanishes moments later, while Render's own log viewer (which only
// captures stdout/stderr) recorded nothing about the crash at all. The fix
// adds the Console transport alongside the file transport in production.
//
// config/logger.js builds its logger once at module-evaluation time from
// process.env.NODE_ENV, so each scenario needs a fresh module instance — a
// cache-busting query string forces Node's ESM loader to re-evaluate it.
async function freshLogger() {
  const mod = await import(`../config/logger.js?t=${Date.now()}-${Math.random()}`);
  return mod.default;
}

function transportNames(handlerMap) {
  return [...handlerMap.values()].map((h) => h.transport?.constructor?.name);
}

test('production: exceptionHandlers include a Console transport (not just the file transport)', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const logger = await freshLogger();
    const names = transportNames(logger.exceptions.handlers);
    assert.ok(names.includes('Console'), `expected a Console handler, got: ${names}`);
    assert.ok(names.includes('DailyRotateFile'), `expected the file handler to still be present too, got: ${names}`);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test('production: rejectionHandlers include a Console transport (not just the file transport)', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const logger = await freshLogger();
    const names = transportNames(logger.rejections.handlers);
    assert.ok(names.includes('Console'), `expected a Console handler, got: ${names}`);
    assert.ok(names.includes('DailyRotateFile'), `expected the file handler to still be present too, got: ${names}`);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test('development: exceptionHandlers/rejectionHandlers remain Console-only (unchanged behavior)', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const logger = await freshLogger();
    assert.deepEqual(transportNames(logger.exceptions.handlers), ['Console']);
    assert.deepEqual(transportNames(logger.rejections.handlers), ['Console']);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});
