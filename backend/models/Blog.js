import mongoose from 'mongoose';

const CATEGORIES = ['quran', 'tajweed', 'arabic', 'hifz', 'islamic-studies', 'general'];

const blogSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    body: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: CATEGORIES,
      default: 'general',
    },
    tags: [{ type: String, lowercase: true, trim: true }],
    author: {
      name:  { type: String, required: true },
      role:  { type: String, default: 'Al-Rahma Team' },
      image: { type: String },
    },
    coverImage: {
      type: String,
    },
    readTime: {
      type: Number,
      default: 5,
    },
    published: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
    },
    seo: {
      metaTitle:       { type: String, maxlength: 70 },
      metaDescription: { type: String, maxlength: 160 },
      canonicalUrl:    { type: String },
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

blogSchema.index({ slug: 1 });
blogSchema.index({ published: 1, publishedAt: -1 });
blogSchema.index({ category: 1, published: 1 });
blogSchema.index({ tags: 1 });

blogSchema.pre('save', function (next) {
  if (this.isModified('published') && this.published && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

const Blog = mongoose.model('Blog', blogSchema);
export { CATEGORIES as BLOG_CATEGORIES };
export default Blog;
