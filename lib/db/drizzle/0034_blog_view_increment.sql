-- Production-readiness audit follow-up (2026-09-17): closes the "blog view
-- count doesn't increment under DATA_BACKEND=supabase" gap
-- (data/supabase/blogController.js's getPost formerly had a KNOWN GAP
-- comment explaining why: anon's only grant on public.blogs is SELECT, no
-- UPDATE at all, and withServiceRole() would bypass RLS for a public
-- visitor action the schema author deliberately never granted — see
-- client.js's own module comment on why that's the wrong tool here).
--
-- The correct fix, matching this schema's own established pattern for
-- "a public/anon caller needs one narrow write capability" (same shape as
-- validate_coupon()/submit_enrollment_booking()): a SECURITY DEFINER RPC
-- that does exactly one thing — increment views by 1 on a single,
-- already-published post matched by slug — and nothing else. It never
-- returns or accepts anything beyond the new count, never touches any
-- other column, and only matches published = true rows (a caller cannot
-- use this to probe for the existence of an unpublished/draft slug).
CREATE OR REPLACE FUNCTION "public"."increment_blog_view"(p_slug text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  new_views integer;
begin
  update public.blogs
     set views = views + 1
   where slug = p_slug and published = true
  returning views into new_views;

  return new_views;
end;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."increment_blog_view"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."increment_blog_view"(text) TO anon, authenticated;
