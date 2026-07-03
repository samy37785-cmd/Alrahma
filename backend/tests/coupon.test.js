import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Unit test for Coupon business logic (no DB required)
describe('Coupon.isValid()', () => {
  // Simulate the Coupon schema methods without Mongoose
  function makeCoupon(overrides = {}) {
    const c = {
      active:       true,
      validFrom:    new Date(Date.now() - 1000),
      validUntil:   new Date(Date.now() + 1000 * 60 * 60),
      maxUses:      null,
      usedCount:    0,
      minOrderAmount: 0,
      discountType: 'percent',
      discountValue: 10,
      usedBy: [],
      ...overrides,
    };
    c.isValid = function () {
      const now = new Date();
      if (!this.active) return false;
      if (this.validFrom && now < this.validFrom) return false;
      if (this.validUntil && now > this.validUntil) return false;
      if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
      return true;
    };
    c.calculateDiscount = function (amount) {
      if (!this.isValid()) return 0;
      if (amount < this.minOrderAmount) return 0;
      if (this.discountType === 'percent') {
        return Math.min((amount * this.discountValue) / 100, amount);
      }
      return Math.min(this.discountValue, amount);
    };
    return c;
  }

  it('is valid when all conditions are met', () => {
    const coupon = makeCoupon();
    assert.equal(coupon.isValid(), true);
  });

  it('is invalid when active is false', () => {
    const coupon = makeCoupon({ active: false });
    assert.equal(coupon.isValid(), false);
  });

  it('is invalid when validUntil is in the past', () => {
    const coupon = makeCoupon({ validUntil: new Date(Date.now() - 1000) });
    assert.equal(coupon.isValid(), false);
  });

  it('is invalid when validFrom is in the future', () => {
    const coupon = makeCoupon({ validFrom: new Date(Date.now() + 1000 * 60) });
    assert.equal(coupon.isValid(), false);
  });

  it('is invalid when maxUses reached', () => {
    const coupon = makeCoupon({ maxUses: 5, usedCount: 5 });
    assert.equal(coupon.isValid(), false);
  });

  it('calculates percent discount correctly', () => {
    const coupon = makeCoupon({ discountType: 'percent', discountValue: 20 });
    assert.equal(coupon.calculateDiscount(100), 20);
  });

  it('calculates fixed discount correctly', () => {
    const coupon = makeCoupon({ discountType: 'fixed', discountValue: 15 });
    assert.equal(coupon.calculateDiscount(100), 15);
  });

  it('caps fixed discount to order amount', () => {
    const coupon = makeCoupon({ discountType: 'fixed', discountValue: 200 });
    assert.equal(coupon.calculateDiscount(50), 50);
  });

  it('returns 0 when order is below minimum', () => {
    const coupon = makeCoupon({ minOrderAmount: 100 });
    assert.equal(coupon.calculateDiscount(50), 0);
  });

  it('returns 0 discount on invalid coupon', () => {
    const coupon = makeCoupon({ active: false });
    assert.equal(coupon.calculateDiscount(100), 0);
  });
});
