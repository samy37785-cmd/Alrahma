import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyStreak } from '../utils/streak.js';

describe('applyStreak()', () => {
  it('starts a new streak at 1 when there is no prior activity', () => {
    const streak = applyStreak({ current: 0, longest: 0, lastReadDate: '' }, '2026-07-01');
    assert.equal(streak.current, 1);
    assert.equal(streak.longest, 1);
    assert.equal(streak.lastReadDate, '2026-07-01');
  });

  it('increments the streak when activity is logged on the very next day', () => {
    const streak = applyStreak({ current: 3, longest: 5, lastReadDate: '2026-07-01' }, '2026-07-02');
    assert.equal(streak.current, 4);
    assert.equal(streak.longest, 5);
  });

  it('is a no-op when activity is logged again on the same day', () => {
    const streak = applyStreak({ current: 4, longest: 5, lastReadDate: '2026-07-02' }, '2026-07-02');
    assert.equal(streak.current, 4);
    assert.equal(streak.longest, 5);
    assert.equal(streak.lastReadDate, '2026-07-02');
  });

  it('resets the streak to 1 after a gap of more than one day', () => {
    const streak = applyStreak({ current: 10, longest: 12, lastReadDate: '2026-07-01' }, '2026-07-05');
    assert.equal(streak.current, 1);
    assert.equal(streak.longest, 12);
  });

  it('raises longest when current exceeds the previous record', () => {
    const streak = applyStreak({ current: 6, longest: 6, lastReadDate: '2026-07-01' }, '2026-07-02');
    assert.equal(streak.current, 7);
    assert.equal(streak.longest, 7);
  });
});
