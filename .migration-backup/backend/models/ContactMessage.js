import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'resolved', 'spam'],
      default: 'new',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    adminNote: {
      type: String,
      maxlength: 1000,
    },
    repliedAt: {
      type: Date,
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true },
);

contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ email: 1 });

const ContactMessage = mongoose.model('ContactMessage', contactSchema);
export default ContactMessage;
