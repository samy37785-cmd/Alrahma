import mongoose from 'mongoose';

// One row per AI Tutor chat conversation. Messages are embedded (chat
// history stays small — capped at TUTOR_HISTORY_LIMIT messages sent to the
// model per turn in aiTutorController.js) rather than needing a separate
// collection.
const tutorMessageSchema = new mongoose.Schema(
  {
    role:    { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true, _id: false }
);

const tutorConversationSchema = new mongoose.Schema(
  {
    user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title:        { type: String, default: 'New conversation' },
    messages:     { type: [tutorMessageSchema], default: [] },
    inputTokens:  { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
);

tutorConversationSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model('TutorConversation', tutorConversationSchema);
