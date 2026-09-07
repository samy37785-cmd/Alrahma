// Admin-router (DATA_BACKEND=supabase) controller for /api/v1/admin/blog.
// blogs_insert_admin_aal2/_update_admin_aal2/_delete_admin_aal2
// (lib/db/drizzle/0002_rls.sql) already require is_admin_aal2() at the DB
// layer — no authorize('blog:write') check inside those policies (unlike
// courses), so the app-layer requirePermissions('blog:write') in
// blogAdminRoutes.js is what actually enforces the permission string here.
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { handleValidationErrors } from '../../../utils/validationHelper.js';
import { withUserContext } from '../client.js';
import { auditAdminAction } from '../adminAuditLog.js';

export { blogValidation, blogUpdateValidation } from '../../../controllers/blogController.js';

// Same allowlist as the Mongo path's BLOG_UPDATABLE_FIELDS — `views` stays
// system-managed (incremented only by the public getPost read path).
const UPDATABLE = ['slug', 'title', 'excerpt', 'category', 'tags', 'author', 'coverImage', 'readTime', 'published', 'publishedAt', 'seo'];

function toJson(row) {
  return {
    _id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    category: row.category,
    tags: row.tags,
    author: { name: row.author_name, role: row.author_role, image: row.author_image },
    coverImage: row.cover_image,
    readTime: row.read_time,
    canonicalUrl: row.canonical_url,
    published: row.published,
    views: row.views,
    publishedAt: row.published_at,
    seo: { metaTitle: row.seo_title, metaDescription: row.seo_description },
    createdAt: row.created_at,
  };
}

// @route POST /api/v1/admin/blog
export const createPost = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const { slug, title, excerpt, body, category, tags = [], author, coverImage, readTime, published, publishedAt, seo } = req.body;

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `INSERT INTO blogs (
           slug, title, content, excerpt, category, tags, author_name, author_role, author_image,
           cover_image, read_time, published, published_at, seo_title, seo_description
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,5),$12,$13,$14,$15)
         RETURNING *`,
        [
          slug, title, body, excerpt ?? null, category ?? null, JSON.stringify(tags),
          author?.name ?? null, author?.role ?? null, author?.image ?? null,
          coverImage ?? null, readTime ?? null, published ?? false,
          published ? (publishedAt ? new Date(publishedAt) : new Date()) : null,
          seo?.metaTitle ?? null, seo?.metaDescription ?? null,
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A post with this slug already exists' });
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  await auditAdminAction({ adminId: req.adminUser.id, action: 'blog.create', resourceType: 'blogs', resourceId: row.id, after: row });
  res.status(201).json({ post: toJson(row) });
});

// @route PATCH /api/v1/admin/blog/:id
export const updatePost = asyncHandler(async (req, res) => {
  if (handleValidationErrors(req, res)) return;
  const updates = {};
  for (const key of UPDATABLE) if (req.body[key] !== undefined) updates[key] = req.body[key];

  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query(
        `UPDATE blogs SET
           slug = COALESCE($2, slug),
           title = COALESCE($3, title),
           excerpt = COALESCE($4, excerpt),
           category = COALESCE($5, category),
           tags = COALESCE($6, tags),
           author_name = COALESCE($7, author_name),
           author_role = COALESCE($8, author_role),
           author_image = COALESCE($9, author_image),
           cover_image = COALESCE($10, cover_image),
           read_time = COALESCE($11, read_time),
           published = COALESCE($12, published),
           published_at = COALESCE($13, published_at)
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id, updates.slug ?? null, updates.title ?? null, updates.excerpt ?? null,
          updates.category ?? null, updates.tags ? JSON.stringify(updates.tags) : null,
          updates.author?.name ?? null, updates.author?.role ?? null, updates.author?.image ?? null,
          updates.coverImage ?? null, updates.readTime ?? null, updates.published ?? null,
          updates.publishedAt ? new Date(updates.publishedAt) : (updates.published ? new Date() : null),
        ]
      );
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A post with this slug already exists' });
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }

  if (!row) return res.status(404).json({ message: 'Post not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'blog.update', resourceType: 'blogs', resourceId: row.id, after: row });
  res.json({ post: toJson(row) });
});

// @route DELETE /api/v1/admin/blog/:id
export const deletePost = asyncHandler(async (req, res) => {
  let row;
  try {
    row = await withUserContext(req.adminUser.id, async (client) => {
      const r = await client.query('DELETE FROM blogs WHERE id = $1 RETURNING id', [req.params.id]);
      return r.rows[0];
    }, { aal: req.adminAal });
  } catch (err) {
    if (err.code === '42501' || /permission denied|row-level security/i.test(err.message)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    throw err;
  }
  if (!row) return res.status(404).json({ message: 'Post not found' });
  await auditAdminAction({ adminId: req.adminUser.id, action: 'blog.delete', resourceType: 'blogs', resourceId: row.id, severity: 'warning' });
  res.json({ message: 'Post deleted' });
});
