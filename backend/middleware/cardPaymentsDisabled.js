// Scope correction (see docs/current-project-status.md): the product keeps
// plans, prices, subscriptions, booking, and admin-driven activation — it
// only cancels ONLINE CARD PAYMENT GATEWAYS (Stripe / PayPal checkout+capture
// / webhooks / card entry). This handler closes exactly those gateway
// routes, on both the Mongo and Supabase backends, with a fixed,
// side-effect-free 410. It never runs a controller, never contacts a
// gateway, and never touches data. An earlier, broader "No Payments
// Product" decision had retired every payment-adjacent route (coupons,
// invoices, manual/offline bookkeeping, admin subscription activation)
// behind a single generic closer (middleware/paymentsRetired.js) — that
// decision was reversed and the middleware removed as dead code (nothing
// mounts it any more); this handler is deliberately narrower and its error
// code (ONLINE_CARD_PAYMENTS_DISABLED) says exactly what's off.
export function cardPaymentsDisabled(req, res) {
  res.status(410).json({ error: 'ONLINE_CARD_PAYMENTS_DISABLED' });
}
