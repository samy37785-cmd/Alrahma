import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';

// T23 (monitoring & observability audit): errorHandler's log entry previously
// omitted requestId, unlike every other log call site in the app (e.g.
// requestLogger.js) — meaning the one log line with the full stack trace for
// a failing request couldn't be correlated (by grepping requestId) with that
// same request's completion-log line or with the x-request-id response
// header a client/support ticket would reference.

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('errorHandler includes req.requestId in the logged error metadata', () => {
  const errorSpy = mock.method(logger, 'error', () => {});
  try {
    const req = { method: 'GET', originalUrl: '/api/whatever', user: null, requestId: 'abc123deadbeef' };
    const res = makeRes();
    const err = new Error('boom');

    errorHandler(err, req, res, () => {});

    assert.equal(errorSpy.mock.calls.length, 1);
    const [, meta] = errorSpy.mock.calls[0].arguments;
    assert.equal(meta.requestId, 'abc123deadbeef');
  } finally {
    errorSpy.mock.restore();
  }
});

test('errorHandler logs requestId as null when none was assigned (never throws)', () => {
  const errorSpy = mock.method(logger, 'error', () => {});
  try {
    const req = { method: 'GET', originalUrl: '/api/whatever', user: null };
    const res = makeRes();
    errorHandler(new Error('boom'), req, res, () => {});

    const [, meta] = errorSpy.mock.calls[0].arguments;
    assert.equal(meta.requestId, null);
  } finally {
    errorSpy.mock.restore();
  }
});
