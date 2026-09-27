import mongoose from 'mongoose';

const CATEGORIES = ['quran', 'tajweed', 'arabic', 'hifz', 'islamic-studies', 'general'];

// Blog SEO Foundation PR A (Localized Article Data Model): only en/ar for
// now, matching the approved scope -- it/fr/es/de are explicitly out of
// scope until a later phase. Exported so both the admin validation layer
// (controllers/blogController.js) and this schema share one allow-list.
const LOCALES = ['en', 'ar'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const blogSchema = new mongoose.Schema(
  {
    // Mandatory for every article going forward. The 'en' default exists
    // purely as a backward-compatible safety net for callers/fixtures that
    // don't pass it (0 real documents exist in production today -- see
    // docs/option-a-mongo-supabase-parity-map.md §9 -- so this default
    // never actually relabels real content); it is not a claim that any
    // untranslated legacy content is English, since none exists.
    locale: {
      type: String,
      required: true,
      enum: LOCALES,
      default: 'en',
    },
    // Links an EN article to its AR counterpart (or vice versa) for the
    // same topic. Nullable -- an article with no translation yet is valid
    // and must not be forced to wait for one. A plain UUID string, not a
    // Mongoose ObjectId, because this value crosses the public/admin API
    // contract and must be storable identically on the Supabase side
    // (lib/db/src/schema/content.ts's blogs.translationGroupId is `uuid`).
    translationGroupId: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v == null || UUID_RE.test(v),
        message: 'translationGroupId must be a UUID string',
      },
    },
    slug: {
      type: String,
      required: true,
      // No longer globally unique on its own -- see the compound
      // (locale, slug) index below. The same slug is now allowed once per
      // locale (an EN and an AR article about the same topic can share it).
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

// Composite uniqueness: the same slug is unique per locale, not globally.
blogSchema.index({ locale: 1, slug: 1 }, { unique: true });
blogSchema.index({ published: 1, publishedAt: -1 });
blogSchema.index({ category: 1, published: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ translationGroupId: 1 }, { sparse: true });

blogSchema.pre('save', function (next) {
  if (this.isModified('published') && this.published && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

const Blog = mongoose.model('Blog', blogSchema);
export { CATEGORIES as BLOG_CATEGORIES, LOCALES as BLOG_LOCALES };
export default Blog;
