import mongoose from 'mongoose';

// Comment on a community Post. Same pending -> approved/rejected moderation
// gate as posts (see Post.js) — a comment is only visible to other students
// once an admin approves it.
const commentSchema = new mongoose.Schema(
  {
    post:      { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body:      { type: String, required: true, maxlength: 1000 },
    status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, status: 1, createdAt: 1 });

export default mongoose.model('Comment', commentSchema);
