import mongoose from 'mongoose';

// Community feed post. Every post starts 'pending' and is only visible in
// the public feed once an admin approves it (moderation-before-publish —
// the platform serves children, so nothing goes live unreviewed).
const postSchema = new mongoose.Schema(
  {
    author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body:      { type: String, required: true, maxlength: 2000 },
    status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });

export default mongoose.model('Post', postSchema);
