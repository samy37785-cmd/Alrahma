import mongoose from 'mongoose';

// A learning resource attached to a course (YouTube playlist, PDF book, etc.)
const resourceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['youtube', 'pdf', 'link'], default: 'link' },
    label: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true },
    description: { type: String, required: [true, 'Description is required'] },
    icon: { type: String, default: '📘' }, // emoji/icon shown on the card
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'All levels'],
      default: 'All levels',
    },
    price: { type: Number, default: 0 },
    resources: { type: [resourceSchema], default: [] }, // links shown on "Start learning"
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Course', courseSchema);
