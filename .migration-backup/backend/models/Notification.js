import mongoose from 'mongoose';

const TYPES = [
  'class_scheduled',
  'class_cancelled',
  'class_reminder',
  'payment_received',
  'payment_failed',
  'subscription_renewed',
  'subscription_expiring',
  'message_received',
  'enrollment_approved',
  'enrollment_rejected',
  'certificate_issued',
  'admin_announcement',
  'coupon_received',
  'review_approved',
  // Community moderation (communityController.moderatePost/moderateComment).
  // These MUST stay in sync with every createNotification() call site — a
  // type missing from this enum makes Notification.create throw a
  // ValidationError at the call site (a 500 for the admin approving the
  // post, after the status update already committed).
  'post_approved',
  'comment_approved',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // No standalone index here — the compound index below covers all recipient
      // lookups via its leftmost prefix, making a single-field index redundant.
    },
    type: {
      type: String,
      enum: TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 160,
    },
    body: {
      type: String,
      required: true,
      maxlength: 500,
    },
    link: {
      type: String,
      maxlength: 300,
    },
    read: {
      type: Boolean,
      default: false,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const Notification = mongoose.model('Notification', notificationSchema);
export { TYPES as NOTIFICATION_TYPES };
export default Notification;
