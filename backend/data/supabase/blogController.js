// DATA_BACKEND=supabase controller for blogs — public read routes only.
// Admin mutations (create/update/delete) live at /api/v1/admin/blog under
// either backend (MFA + RBAC + audit-logged — see routes/v1/admin/
// blogRoutes.js) and are not part of the matched-domain set assigned here;
// this file does not touch or replicate them.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { withAnonContext } from './client.js';

// Stage 2E documented category/coverImage/readTime as missing columns
// (always null). Stage 2F closed that (0014_close_partial_gaps_schema.sql
// adds blogs.category/cover_image/read_time/canonical_url).
function mapListRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    tags: row.tags,
    author: { name: row.author_name, role: row.author_role, image: row.author_image },
    coverImage: row.cover_image,
    readTime: row.read_time,
    publishedAt: row.published_at,
    views: row.views,
  };
}

// @route  GET /api/blog
// @access Public
export const listPosts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 9, maxLimit: 20 });
  const { category, tag } = req.query;

  const { rows, total } = await withAnonContext(async (client) => {
    // blogs_select_published_or_admin (0002_rls.sql) lets anon see only
    // published = true rows, matching the Mongo filter's { published: true }.
    const conditions = ['published = true'];
    const params = [];
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (tag) {
      params.push(tag);
      conditions.push(`tags ? $${params.length}`);
    }
    const where = conditions.join(' AND ');

    params.push(limit, skip);
    const listSql = `SELECT id, title, slug, excerpt, category, tags, author_name, author_role,
              author_image, cover_image, read_time, published_at, views
         FROM blogs
        WHERE ${where}
        ORDER BY published_at DESC NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const countParams = params.slice(0, params.length - 2);
    const countSql = `SELECT count(*)::int AS total FROM blogs WHERE ${where}`;

    // Sequential, not Promise.all — a single pg client can only run one
    // query at a time; firing several concurrently on it is deprecated,
    // undefined behavior, not real parallelism (same bug class found and
    // fixed in parentController.js/reviewController.js during the Al-Rahma
    // Final Corrections Part A rehearsal).
    const listRes = await client.query(listSql, params);
    const countRes = await client.query(countSql, countParams);
    return { rows: listRes.rows, total: countRes.rows[0].total };
  });

  // Blog listings change infrequently; cache for 5 min, serve stale for 60 s
  // while revalidating in the background — same policy as the Mongo path.
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ posts: rows.map(mapListRow), total, page, pages: Math.ceil(total / limit) });
});

// @route  GET /api/blog/:slug
// @access Public
export const getPost = asyncHandler(async (req, res) => {
  const post = await withAnonContext(async (client) => {
    const r = await client.query(
      `SELECT id, title, slug, content, excerpt, category, tags, author_name,
              author_role, author_image, cover_image, read_time, canonical_url,
              published, views, published_at, seo_title, seo_description, created_at
         FROM blogs
        WHERE slug = $1 AND published = true`,
      [req.params.slug]
    );
    return r.rows[0];
  });

  if (!post) return res.status(404).json({ message: 'Post not found' });

  // KNOWN GAP: the Mongo controller increments `views` on every read
  // (findOneAndUpdate with $inc). That cannot be reproduced here: anon's
  // only grant on `blogs` is SELECT (0002_rls.sql /
  // 0004_privilege_reconciliation.sql: `grant select on public.plans,
  // public.blogs, public.testimonials to anon`) — there is no UPDATE grant
  // to anon at all, and this isn't an admin/AAL2 action either (it's a
  // public visitor action). There is therefore no RLS-legitimate way for
  // this request to increment the counter. Reaching for withServiceRole
  // here would bypass RLS for a public visitor action the schema author did
  // not grant — exactly what client.js's module comment warns against — so
  // the view count is simply not incremented under DATA_BACKEND=supabase.
  res.json({
    post: {
      _id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.content,
      category: post.category,
      tags: post.tags,
      author: { name: post.author_name, role: post.author_role, image: post.author_image },
      coverImage: post.cover_image,
      readTime: post.read_time,
      published: post.published,
      publishedAt: post.published_at,
      seo: {
        metaTitle: post.seo_title,
        metaDescription: post.seo_description,
        canonicalUrl: post.canonical_url,
      },
      views: post.views,
      createdAt: post.created_at,
    },
  });
});
