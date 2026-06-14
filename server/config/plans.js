// Server-side source of truth for pricing. NEVER trust the amount sent by the
// browser — the client only sends the plan name, and we look up the real price
// here. This prevents a user from tampering with the amount they pay.
//
// `amount` is the monthly price. `currency` is the display currency (EUR).
// PayMob settles in the currency your account is configured for (often EGP);
// set PAYMOB_CURRENCY in .env to match your merchant account.
export const PLANS = {
  Starter:  { name: 'Starter',  amount: 56,  originalAmount: 75,  discountPct: 25, currency: 'EUR' },
  Standard: { name: 'Standard', amount: 84,  originalAmount: 112, discountPct: 25, currency: 'EUR' },
  Premium:  { name: 'Premium',  amount: 112, originalAmount: 149, discountPct: 25, currency: 'EUR' },
};

// Look up a plan by name; returns undefined if unknown (controllers send 400).
export function getPlan(name) {
  return PLANS[name];
}
