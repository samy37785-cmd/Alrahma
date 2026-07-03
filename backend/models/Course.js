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

// A single lesson inside a module. A lesson is either a piece of media
// (video/pdf/link) or a block of text, plus optional extra resources. `order`
// controls its position within the module.
const lessonSchema = new mongoose.Schema(
  {
    title:     { type: String, required: true, trim: true },
    type:      { type: String, enum: ['video', 'pdf', 'link', 'text'], default: 'video' },
    url:       { type: String, default: '' },        // for video/pdf/link
    content:   { type: String, default: '' },        // for text lessons (HTML/markdown)
    duration:  { type: String, default: '' },        // free-text, e.g. "12 min"
    resources: { type: [resourceSchema], default: [] },
    order:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

// A module (chapter) groups ordered lessons within a course.
const moduleSchema = new mongoose.Schema(
  {
    title:   { type: String, required: true, trim: true },
    summary: { type: String, default: '' },
    order:   { type: Number, default: 0 },
    lessons: { type: [lessonSchema], default: [] },
  },
  { timestamps: true }
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
    tags: [{ type: String, lowercase: true, trim: true }],  // used by searchController
    resources: { type: [resourceSchema], default: [] }, // legacy flat links (still supported)
    modules: { type: [moduleSchema], default: [] },     // structured chapters → lessons
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Matches the public catalogue query in `getCourses` (courseController.js):
// find({ published: true }).sort('-createdAt') — same compound-index shape
// used for the same filter+sort pattern on the Blog model.
courseSchema.index({ published: 1, createdAt: -1 });

export default mongoose.model('Course', courseSchema);
