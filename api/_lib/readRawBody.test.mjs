import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { readRawBody } from './readRawBody.mjs';

test('readRawBody: concatenates chunks into the exact original bytes', async () => {
  const stream = Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]);
  const buf = await readRawBody(stream);
  assert.equal(buf.toString('utf8'), '{"a":1}');
});

test('readRawBody: an empty stream yields an empty buffer', async () => {
  const stream = Readable.from([]);
  const buf = await readRawBody(stream);
  assert.equal(buf.length, 0);
});

test('readRawBody: string chunks are converted to Buffer without corrupting content', async () => {
  const stream = Readable.from(['hello ', 'world']);
  const buf = await readRawBody(stream);
  assert.equal(buf.toString('utf8'), 'hello world');
});
