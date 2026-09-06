// DATA_BACKEND=supabase controller for blogs — public read routes only.
// Admin mutations (create/update/delete) live at /api/v1/admin/blog under
// either backend (MFA + RBAC + audit-logged — see routes/v1/admin/
// blogRoutes.js) and are not part of the matched-domain set assigned here;
// this file does not touch or replicate them.
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { withAnonContext } from './client.js';

// KNOWN GAP (see docs/option-a-mongo-supabase-parity-map.md, "Blog"
// section): Mongo's `category` (enum), `coverImage` (URL string) and
// `readTime` (number, default 5) fields have no Postgres column at all —
// returned as null below rather than guessing a mapping or fabricating a
// default value.
function mapListRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: null,
    tags: row.tags,
    author: { name: row.author_name, role: row.author_role, image: row.author_image },
    coverImage: null,
    readTime: null,
    publishedAt: row.published_at,
    views: row.views,
  };
}

// @route  GET /api/blog
// @access Public
export const listPosts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 9, maxLimit: 20 });
  const { category, tag } = req.query;
  // `category` has no Postgres column (see mapListRow's comment) — a
  // category filter cannot be applied under this backend and is silently
  // ignored rather than guessing a mapping. `tag` maps onto the `tags`
  // jsonb array via the `?` containment operator ("does this array contain
  // this string element").
  void category;

  const { rows, total } = await withAnonContext(async (client) => {
    // blogs_select_published_or_admin (0002_rls.sql) lets anon see only
    // published = true rows, matching the Mongo filter's { published: true }.
    const listSql = tag
      ? `SELECT id, title, slug, excerpt, tags, author_name, author_role,
                author_image, published_at, views
           FROM blogs
          WHERE published = true AND tags ? $3
          ORDER BY published_at DESC NULLS LAST
          LIMIT $1 OFFSET $2`
      : `SELECT id, title, slug, excerpt, tags, author_name, author_role,
                author_image, published_at, views
           FROM blogs
          WHERE published = true
          ORDER BY published_at DESC NULLS LAST
          LIMIT $1 OFFSET $2`;
    const listParams = tag ? [limit, skip, tag] : [limit, skip];

    const countSql = tag
      ? 'SELECT count(*)::int AS total FROM blogs WHERE published = true AND tags ? $1'
      : 'SELECT count(*)::int AS total FROM blogs WHERE published = true';
    const countParams = tag ? [tag] : [];

    const [listRes, countRes] = await Promise.all([
      client.query(listSql, listParams),
      client.query(countSql, countParams),
    ]);
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
      `SELECT id, title, slug, content, excerpt, tags, author_name,
              author_role, author_image, published, views, published_at,
              seo_title, seo_description, created_at
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
      category: null, // gap — see mapListRow's comment
      tags: post.tags,
      author: { name: post.author_name, role: post.author_role, image: post.author_image },
      coverImage: null, // gap
      readTime: null, // gap
      published: post.published,
      publishedAt: post.published_at,
      seo: {
        metaTitle: post.seo_title,
        metaDescription: post.seo_description,
        canonicalUrl: null, // gap — no Postgres column
      },
      views: post.views,
      createdAt: post.created_at,
    },
  });
});
