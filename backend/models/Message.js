import mongoose from 'mongoose';

// A direct message between a student and their assigned teacher. The pair is
// stored sorted (in `participants`) so a conversation can be queried regardless
// of who sent which message.
const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Fetching a conversation = all messages where (from,to) is either direction.
messageSchema.index({ from: 1, to: 1, createdAt: 1 });

export default mongoose.model('Message', messageSchema);
