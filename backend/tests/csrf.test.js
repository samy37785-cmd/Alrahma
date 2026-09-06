import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Unit test for CSRF token validation logic (no HTTP server required)
describe('CSRF token validation', () => {
  const TOKEN_BYTES = 32;

  function generateToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('hex');
  }

  function tokensMatch(a, b) {
    if (!a || !b) return false;
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== TOKEN_BYTES || bufB.length !== TOKEN_BYTES) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  it('matches identical tokens', () => {
    const token = generateToken();
    assert.equal(tokensMatch(token, token), true);
  });

  it('rejects different tokens', () => {
    const a = generateToken();
    const b = generateToken();
    assert.equal(tokensMatch(a, b), false);
  });

  it('rejects empty string as token', () => {
    const token = generateToken();
    assert.equal(tokensMatch(token, ''), false);
  });

  it('rejects undefined tokens', () => {
    assert.equal(tokensMatch(undefined, undefined), false);
  });

  it('rejects tokens of wrong length', () => {
    assert.equal(tokensMatch('abc', 'abc'), false);
  });

  it('generated tokens are unique', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    assert.equal(tokens.size, 100);
  });

  it('generated tokens are 64 hex characters', () => {
    const token = generateToken();
    assert.equal(token.length, TOKEN_BYTES * 2);
    assert.match(token, /^[0-9a-f]+$/);
  });
});
