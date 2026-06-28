// Server-side source of truth for pricing. NEVER trust the amount sent by the
// browser — the client only sends the plan name, and we look up the real price
// here. This prevents a user from tampering with the amount they pay.
//
// `amount` is the monthly price. `currency` is the billing currency (EUR) —
// charged as-is by both Stripe and PayPal.
export const PLANS = {
  Starter:  { name: 'Starter',  amount: 56,  originalAmount: 75,  discountPct: 25, currency: 'EUR' },
  Standard: { name: 'Standard', amount: 84,  originalAmount: 112, discountPct: 25, currency: 'EUR' },
  Premium:  { name: 'Premium',  amount: 112, originalAmount: 149, discountPct: 25, currency: 'EUR' },
};

// Look up a plan by name; returns undefined if unknown (controllers send 400).
// Uses an own-property check so inherited keys like "__proto__" or "toString"
// can't slip past the "unknown plan" guard and reach the price math.
export function getPlan(name) {
  return Object.hasOwn(PLANS, name) ? PLANS[name] : undefined;
}
