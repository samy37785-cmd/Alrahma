// Test doubles for the owner-run operator tools (scripts/ops/): a scripted
// terminal and a leak scanner. Used by the unit tests here and by
// scripts/ops/operator-tools.real-gotrue.test.mjs.
import assert from 'node:assert/strict';

/**
 * A scripted, "interactive" terminal. Each queued answer is a value or a
 * function returning one (evaluated when the prompt is reached). Records
 * everything printed (the tool's log), everything shown as sensitive (the
 * TOTP QR), and the order of events.
 */
export function scriptedIo({ hidden = [], visible = [], interactive = true } = {}) {
  const hiddenQueue = [...hidden];
  const visibleQueue = [...visible];
  const log = [];
  const sensitive = [];
  const events = [];
  const take = async (queue, kind, label) => {
    events.push(`${kind}:${label}`);
    if (!queue.length) throw new Error(`unexpected ${kind} prompt: ${label}`);
    const next = queue.shift();
    return typeof next === 'function' ? next(label) : next;
  };
  return {
    interactive,
    log,
    sensitive,
    events,
    print: (line) => {
      log.push(String(line));
      events.push('print');
    },
    promptHidden: (label) => take(hiddenQueue, 'hidden', label),
    promptVisible: (label) => take(visibleQueue, 'visible', label),
    showSensitive: (text) => {
      sensitive.push(String(text));
      events.push('showSensitive');
    },
    clearSensitive: () => events.push('clearSensitive'),
    remaining: () => ({ hidden: hiddenQueue.length, visible: visibleQueue.length }),
  };
}

/** Every value in `secrets` (and its lowercase and URL-encoded forms) is absent from every text. */
export function assertNoLeaks(texts, secrets, label = 'output') {
  const haystacks = texts.filter((t) => t !== undefined && t !== null).map(String);
  let checked = 0;
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < 4) continue;
    for (const form of new Set([secret, secret.toLowerCase(), encodeURIComponent(secret)])) {
      for (const text of haystacks) {
        assert.ok(!text.includes(form) && !text.toLowerCase().includes(form.toLowerCase()), `${label} leaks a secret value (${secret.length} chars)`);
      }
    }
    checked++;
  }
  return checked;
}

/** A JWT-shaped API key built at runtime (never a literal), with the given claims. Not signed. */
export function fakeJwtKey(claims) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return [part({ alg: 'HS256', typ: 'JWT' }), part(claims), 'test-signature-not-real'].join('.');
}
