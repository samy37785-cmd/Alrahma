import Notification from '../models/Notification.js';
import logger from '../config/logger.js';

/**
 * Notification dispatch — the write-side API used by business events
 * (payments, live classes, certificates, messages, reviews, the
 * renewal-reminder cron). Lives in the service layer so controllers depend
 * on a service, not on each other (it previously lived in
 * notificationController.js and was imported by 9 sibling controllers).
 *
 * The no-recipient guard is centralized here so call sites don't repeat
 * "if (userId) { ... }": Notification.recipient is a required field and
 * several sources (guest checkouts, Stripe webhooks missing metadata)
 * legitimately have no user to notify.
 *
 * @param {object} fields  { recipient, type, title, body, link, data }
 * @param {object} [opts]  { session } — optional Mongoose session so the
 *                         notification commits atomically with the
 *                         payment/subscription writes it accompanies.
 */
export async function createNotification({ recipient, type, title, body, link, data }, { session } = {}) {
  if (!recipient) {
    logger.debug('createNotification skipped — no recipient', { type });
    return null;
  }
  const sessionOpts = session ? { session } : {};
  const [notification] = await Notification.create(
    [{ recipient, type, title, body, link, data }],
    sessionOpts,
  );
  return notification;
}
