// Booking-First Enrollment: there is no in-app online payment anywhere in
// the customer-facing product any more (see docs/current-project-status.md).
// This handler replaces every customer-reachable payment-initiation entry
// point (Stripe/PayPal session+capture, manual-payment methods+submission,
// coupon validation) at the ROUTE level — the underlying controllers stay
// in the codebase untouched (legacy/deferred, still used by webhooks and by
// admin review of historical records), only the routing to them from a
// customer-facing request is removed. A fixed 410 + stable error code lets
// any old client (a stale tab, a bookmarked link, a cached SPA bundle)
// fail predictably instead of hitting a gateway that server-side no longer
// prices/charges anything.
export function paymentsDisabled(req, res) {
  res.status(410).json({
    error: 'PAYMENTS_DISABLED',
    message: 'Online payment is no longer available. Please submit a booking request and our team will contact you on WhatsApp to arrange payment.',
  });
}
