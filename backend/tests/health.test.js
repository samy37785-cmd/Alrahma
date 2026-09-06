import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';

// Smoke tests for the public health endpoints. These are registered BEFORE the
// DB-connect middleware on purpose (so a platform health check never blocks on a
// cold database) — which also lets us exercise the real app without a database.

test('GET / returns the service banner', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'Al-Rahma Academy API');
});

test('GET /health reports ok with an uptime number', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.uptime, 'number');
});

test('CORS rejects a disallowed origin', async () => {
  const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
  // The cors middleware throws for a blocked origin -> handled as a 500 by the
  // error handler; the key assertion is it does NOT echo the origin back.
  assert.notEqual(res.headers['access-control-allow-origin'], 'https://evil.example.com');
});

test('CORS allows a localhost dev origin', async () => {
  const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
});
