import mongoose from 'mongoose';

// Retry/outbox for emails that failed to send synchronously (e.g. the
// booking admin-notification email — see controllers/enrollmentController.js).
// The triggering action (a booking, a payment review, etc.) always commits
// regardless of whether the notification email succeeds; a failed send is
// queued here instead of only being logged, and controllers/cronController.js's
// retryFailedEmails job (GET /api/cron/retry-failed-emails, same CRON_SECRET-
// gated pattern as the existing renewal-reminders/weekly-parent-reports jobs)
// periodically retries it. A row is deleted on success; MAX_ATTEMPTS in that
// job caps retries so a permanently-bad address doesn't retry forever.
const emailOutboxSchema = new mongoose.Schema({
  to: { type: String, required: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  // Free-form context for observability only (e.g. { type: 'booking_notification', bookingRef }) — never read by the retry logic itself.
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  lastAttemptAt: { type: Date },
}, { timestamps: true });

emailOutboxSchema.index({ attempts: 1, createdAt: 1 });

export default mongoose.model('EmailOutbox', emailOutboxSchema);
