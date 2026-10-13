import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plans } from '../data/home';
import { siteFacts } from '../data/siteFacts';
import faqItems from '../data/faqItems';

// public/llms.txt is static, so it cannot import these values. This test
// keeps its "Key facts" section in step with the data the pages render.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const txt = fs.readFileSync(path.join(ROOT, 'public', 'llms.txt'), 'utf8');
const facts = (() => {
  const start = txt.indexOf('## Key facts\n');
  const end = txt.indexOf('\n## ', start + 1);
  return start >= 0 ? txt.slice(start, end) : '';
})();

describe('llms.txt Key facts', () => {
  it('exists and sits before the language and page lists', () => {
    expect(facts).not.toBe('');
    expect(txt.indexOf('## Key facts')).toBeLessThan(txt.indexOf('## Published languages'));
  });

  it('lists every plan with its real price and lessons', () => {
    expect(plans.map((p) => p.name)).toEqual(['Noorani', 'Huffaz', 'Ijazah']);
    for (const p of plans) {
      expect(facts).toContain(
        `${p.name}: ${p.price} per month, ${p.sessionsPerWeek} lessons per week (${p.sessionsPerMonth} per month).`,
      );
      expect(p.features).toContain('1 hour per class');
    }
    expect(new Set(plans.map((p) => p.pricePerHour)).size).toBe(1);
    expect(facts).toContain(`Every plan works out at ${plans[0].pricePerHour} per lesson hour.`);
    expect(facts).toContain('1 hour each');
  });

  it('states the trial and refund terms the site uses', () => {
    expect(siteFacts.freeTrialLessons).toBe(1);
    expect(facts).toContain(`one free ${siteFacts.trialLessonMinutes}-minute trial lesson`);
    expect(facts).toContain(`within ${siteFacts.refundWindowDays} days of the first payment`);
  });

  it('shows no crossed-out price, discount or urgency', () => {
    // An old price that is not also a current price (Huffaz's old €112 is
    // Ijazah's current price) must not appear.
    const current = new Set(plans.map((p) => p.price));
    for (const p of plans) {
      if (!current.has(p.originalPrice)) expect(facts).not.toContain(p.originalPrice);
    }
    expect(facts).not.toMatch(/%|discount|limited|only \d+ (spots|places)/i);
  });
});

describe('FAQ refund answer matches the Refund Policy', () => {
  const refund = faqItems.find((item) => item.en.q === 'What is your refund policy?');

  it('every language states the 24-day window and no deduction for attended lessons', () => {
    expect(Object.keys(refund).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it']);
    for (const lang of Object.keys(refund)) {
      expect(refund[lang].a, lang).toContain(String(siteFacts.refundWindowDays));
      expect(refund[lang].a, lang).toContain('5');
    }
    expect(refund.en.a).toContain('no deduction for lessons already attended');
  });

  it('no longer says delivered lessons cannot be refunded', () => {
    const all = JSON.stringify(refund);
    expect(all).not.toMatch(/already been delivered|già erogate|ya impartidas|bereits erteilte|déjà dispensés|سبق تقديمها/);
  });
});
