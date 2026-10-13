import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestLogger, pathOnly } from '../middleware/requestLogger.js';
import { errorHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';

// Audit AR-15: request and error logs keep no full IP, no X-Forwarded-For chain
// and no query string (which can carry an email or a one-time token).

function finishedRequest(req, statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  requestLogger(req, res, () => {});
  res.emit('finish');
}

test('requestLogger logs a masked IP, no X-Forwarded-For and the path without its query string', () => {
  const spy = mock.method(logger, 'info', () => {});
  try {
    finishedRequest({
      method: 'GET',
      path: '/api/auth/reset-password',
      originalUrl: '/api/auth/reset-password?token=abc123secret&email=a%40b.c',
      ip: '203.0.113.77',
      headers: { 'x-forwarded-for': '203.0.113.77, 10.0.0.1' },
      requestId: 'r1',
    });
    assert.equal(spy.mock.calls.length, 1);
    const [message, meta] = spy.mock.calls[0].arguments;
    assert.equal(message, 'GET /api/auth/reset-password');
    assert.equal(meta.ip, '203.0.113.xxx');
    assert.equal('xff' in meta, false);
    assert.doesNotMatch(JSON.stringify([message, meta]), /abc123secret|a%40b\.c|203\.0\.113\.77|10\.0\.0\.1/);
  } finally {
    spy.mock.restore();
  }
});

test('requestLogger masks IPv6 and IPv4-mapped addresses too', () => {
  const spy = mock.method(logger, 'warn', () => {});
  try {
    finishedRequest({ method: 'POST', path: '/api/x', originalUrl: '/api/x', ip: '2001:db8:85a3:8d3:1319:8a2e:370:7348', headers: {} }, 404);
    finishedRequest({ method: 'POST', path: '/api/x', originalUrl: '/api/x', ip: '::ffff:198.51.100.9', headers: {} }, 404);
    assert.deepEqual(spy.mock.calls.map((c) => c.arguments[1].ip), ['2001:db8:85a3:8d3:xxxx:xxxx:xxxx:xxxx', '198.51.100.xxx']);
  } finally {
    spy.mock.restore();
  }
});

test('errorHandler logs the path without its query string', () => {
  const spy = mock.method(logger, 'error', () => {});
  try {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    errorHandler(new Error('boom'), { method: 'GET', originalUrl: '/api/verify?token=abc123secret', user: null }, res, () => {});
    assert.equal(spy.mock.calls[0].arguments[1].path, '/api/verify');
  } finally {
    spy.mock.restore();
  }
});

test('pathOnly keeps the path and tolerates a missing URL', () => {
  assert.equal(pathOnly('/a/b?c=d'), '/a/b');
  assert.equal(pathOnly('/a/b'), '/a/b');
  assert.equal(pathOnly(undefined), '');
});
