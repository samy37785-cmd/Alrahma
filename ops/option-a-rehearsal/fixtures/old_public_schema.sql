-- Reconstructed OLD remote public schema (rehearsal fixture)
-- Generated from real remote inventory data captured 2026-08-30
-- (docs/remote-supabase-inventory.md). Column types/nullability/PKs/FKs
-- are real; this is a faithful structural facsimile for rehearsal
-- purposes, not a byte-exact pg_dump of the real project.

create type public.role as enum ('student','teacher','parent','admin');
create type public.subscription_provider as enum ('stripe','paypal','manual');
create type public.subscription_status as enum ('none','active','past_due','canceled');

create table public.admin_lockouts (
  "email" text not null,
  "failed_attempts" integer not null default 0,
  "locked_until" timestamptz,
  "updated_at" timestamptz not null default now()
);

create table public.blogs (
  "id" uuid not null default gen_random_uuid(),
  "title" text not null,
  "slug" text not null,
  "content" text not null,
  "excerpt" text,
  "tags" jsonb not null default '[]'::jsonb,
  "author_name" text,
  "author_role" text,
  "author_image" text,
  "published" boolean not null default false,
  "views" integer not null default 0,
  "published_at" timestamptz,
  "seo_title" text,
  "seo_description" text,
  "created_at" timestamptz not null default now()
);

create table public.certificates (
  "id" uuid not null default gen_random_uuid(),
  "certificate_number" text not null,
  "user_id" uuid not null,
  "student_name" text not null,
  "type" text not null,
  "title" text not null,
  "course_id" uuid,
  "issued_by" uuid,
  "grade" text,
  "notes" text,
  "issued_at" timestamptz not null default now(),
  "revoked" boolean not null default false
);

create table public.comments (
  "id" uuid not null default gen_random_uuid(),
  "post_id" uuid not null,
  "author_id" uuid not null,
  "body" text not null,
  "status" text not null default 'pending'::text,
  "admin_note" text,
  "created_at" timestamptz not null default now()
);

create table public.contact_messages (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "email" text not null,
  "subject" text,
  "message" text not null,
  "status" text not null default 'new'::text,
  "responded_by_id" uuid,
  "responded_at" timestamptz,
  "admin_note" text,
  "created_at" timestamptz not null default now()
);

create table public.coupon_redemptions (
  "coupon_id" uuid not null,
  "user_id" uuid not null,
  "used_at" timestamptz not null default now()
);

create table public.coupons (
  "id" uuid not null default gen_random_uuid(),
  "code" text not null,
  "description" text,
  "type" text not null,
  "value" numeric not null,
  "max_uses" integer,
  "applicable_plans" jsonb not null default '[]'::jsonb,
  "expires_at" timestamptz,
  "active" boolean not null default true
);

create table public.course_progress (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "course_id" uuid not null,
  "completed" jsonb not null default '[]'::jsonb,
  "last_activity" timestamptz
);

create table public.courses (
  "id" uuid not null default gen_random_uuid(),
  "title" text not null,
  "description" text,
  "icon" text,
  "price" numeric,
  "tags" jsonb not null default '[]'::jsonb,
  "resources" jsonb,
  "modules" jsonb not null default '[]'::jsonb,
  "published" boolean not null default false,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table public.enrollments (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "email" text not null,
  "whatsapp" text,
  "country" text,
  "city" text,
  "timezone" text,
  "lang" text,
  "level" text,
  "age_group" text,
  "gender_pref" text,
  "status" text not null default 'new'::text,
  "notes" text,
  "created_at" timestamptz not null default now()
);

create table public.hifz_progress (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "chapter_id" integer not null,
  "chapter_name" text not null,
  "total_verses" integer not null,
  "memorized_verses" jsonb not null default '[]'::jsonb,
  "last_revised" timestamptz
);

create table public.invoices (
  "id" uuid not null default gen_random_uuid(),
  "invoice_number" text not null,
  "user_id" uuid not null,
  "customer_email" text not null,
  "customer_name" text not null,
  "plan" text not null,
  "amount" numeric not null,
  "original_amount" numeric,
  "discount_pct" numeric,
  "currency" text not null default 'USD'::text,
  "billing_period" text,
  "status" text not null default 'issued'::text,
  "payment_id" uuid,
  "gateway_invoice_id" text,
  "created_at" timestamptz not null default now()
);

create table public.live_classes (
  "id" uuid not null default gen_random_uuid(),
  "teacher_id" uuid not null,
  "student_id" uuid not null,
  "title" text not null,
  "starts_at" timestamptz not null,
  "duration_min" integer not null,
  "meeting_url" text,
  "notes" text,
  "status" text not null default 'scheduled'::text
);

create table public.manual_payments (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid,
  "plan" text not null,
  "amount" numeric not null,
  "currency" text not null default 'USD'::text,
  "method" text not null,
  "coupon_code" text,
  "discount_amount" numeric,
  "customer_name" text not null,
  "customer_email" text not null,
  "customer_phone" text,
  "reference" text,
  "notes" text,
  "status" text not null default 'pending'::text,
  "admin_note" text,
  "created_at" timestamptz not null default now(),
  "reviewed_at" timestamptz
);

create table public.messages (
  "id" uuid not null default gen_random_uuid(),
  "from_id" uuid not null,
  "to_id" uuid not null,
  "body" text not null,
  "read_at" timestamptz,
  "created_at" timestamptz not null default now()
);

create table public.notifications (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "type" text not null,
  "title" text not null,
  "body" text,
  "link" text,
  "read" boolean not null default false,
  "meta" jsonb,
  "created_at" timestamptz not null default now()
);

create table public.payments (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid,
  "plan" text not null,
  "amount" numeric not null,
  "currency" text not null default 'USD'::text,
  "coupon_code" text,
  "discount_amount" numeric,
  "gateway" text not null,
  "method" text,
  "customer_name" text,
  "customer_email" text,
  "customer_phone" text,
  "status" text not null default 'pending'::text,
  "gateway_order_id" text not null,
  "gateway_txn_id" text,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "raw" jsonb,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table public.post_likes (
  "post_id" uuid not null,
  "user_id" uuid not null
);

create table public.posts (
  "id" uuid not null default gen_random_uuid(),
  "author_id" uuid not null,
  "body" text not null,
  "status" text not null default 'pending'::text,
  "admin_note" text,
  "created_at" timestamptz not null default now()
);

create table public.profile_children (
  "parent_id" uuid not null,
  "child_id" uuid not null
);

create table public.profiles (
  "id" uuid not null,
  "email" text not null,
  "name" text not null,
  "role" public.role not null default 'student'::role,
  "family_name" text,
  "parent_link_code" text,
  "teacher_id" uuid,
  "teacher_specialization" text,
  "teacher_bio" text,
  "teacher_gender" text,
  "teacher_languages" jsonb,
  "teacher_subjects" jsonb,
  "teacher_rating" numeric,
  "xp" integer not null default 0,
  "level" integer not null default 1,
  "streak" integer not null default 0,
  "badges" jsonb not null default '[]'::jsonb,
  "referral_code" text,
  "subscription_plan" text,
  "subscription_status" public.subscription_status not null default 'none'::subscription_status,
  "subscription_provider" public.subscription_provider,
  "subscription_valid_until" timestamptz,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "renewal_reminder_sent_for" timestamptz,
  "extra_permissions" jsonb not null default '[]'::jsonb,
  "is_active" boolean not null default true,
  "last_login_at" timestamptz,
  "last_login_ip_anon" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table public.quran_bookmarks (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "verse_key" text not null,
  "chapter_id" integer not null,
  "verse_num" integer not null,
  "note" text,
  "color" text,
  "created_at" timestamptz not null default now()
);

create table public.quran_memorization_stats (
  "user_id" uuid not null,
  "goal" integer,
  "total_recordings" integer not null default 0,
  "total_practice_time" integer not null default 0,
  "streak" integer not null default 0
);

create table public.quran_reading_progress (
  "user_id" uuid not null,
  "resume" jsonb,
  "goal" integer,
  "streak" integer not null default 0,
  "history" jsonb not null default '[]'::jsonb
);

create table public.rate_limit_counters (
  "bucket" text not null,
  "window_start" timestamptz not null,
  "count" integer not null default 1
);

create table public.referrals (
  "id" uuid not null default gen_random_uuid(),
  "referrer_id" uuid not null,
  "referee_id" uuid,
  "code" text not null,
  "status" text not null default 'pending'::text,
  "reward_amount" numeric,
  "converted_at" timestamptz,
  "rewarded_at" timestamptz
);

create table public.reviews (
  "id" uuid not null default gen_random_uuid(),
  "reviewer_id" uuid not null,
  "target_type" text not null,
  "target_teacher_id" uuid,
  "target_course_id" uuid,
  "rating" integer not null,
  "comment" text,
  "status" text not null default 'pending'::text,
  "created_at" timestamptz not null default now()
);

create table public.student_records (
  "id" uuid not null default gen_random_uuid(),
  "student_id" uuid not null,
  "teacher_id" uuid not null,
  "course_id" uuid,
  "date" timestamptz not null,
  "grade" numeric,
  "grade_label" text,
  "attendance" text,
  "memo_from" text,
  "memo_to" text,
  "review" text,
  "tajweed" text,
  "homework" text,
  "note" text,
  "created_at" timestamptz not null default now()
);

create table public.subscribers (
  "id" uuid not null default gen_random_uuid(),
  "email" text not null,
  "status" text not null default 'subscribed'::text,
  "created_at" timestamptz not null default now()
);

create table public.system_audit_log (
  "id" uuid not null default gen_random_uuid(),
  "admin_id" uuid,
  "admin_email" text,
  "action" text not null,
  "resource" text not null,
  "resource_id" text,
  "before" jsonb,
  "after" jsonb,
  "ip_anon" text,
  "metadata" jsonb,
  "created_at" timestamptz not null default now()
);

create table public.system_config (
  "key" text not null,
  "value" text,
  "description" text,
  "updated_by_id" uuid,
  "updated_at" timestamptz not null default now()
);

create table public.trial_requests (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "email" text not null,
  "phone" text,
  "course" text,
  "message" text,
  "status" text not null default 'new'::text,
  "created_at" timestamptz not null default now()
);

create table public.tutor_conversations (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "title" text,
  "messages" jsonb not null default '[]'::jsonb,
  "input_tokens" integer not null default 0,
  "output_tokens" integer not null default 0,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table public.wishlist_items (
  "user_id" uuid not null,
  "course_id" uuid not null,
  "added_at" timestamptz not null default now()
);

alter table public.student_records add constraint student_records_pkey PRIMARY KEY (id);
alter table public.blogs add constraint blogs_pkey PRIMARY KEY (id);
alter table public.blogs add constraint blogs_slug_unique UNIQUE (slug);
alter table public.contact_messages add constraint contact_messages_pkey PRIMARY KEY (id);
alter table public.subscribers add constraint subscribers_pkey PRIMARY KEY (id);
alter table public.subscribers add constraint subscribers_email_unique UNIQUE (email);
alter table public.trial_requests add constraint trial_requests_pkey PRIMARY KEY (id);
alter table public.tutor_conversations add constraint tutor_conversations_pkey PRIMARY KEY (id);
alter table public.certificates add constraint certificates_pkey PRIMARY KEY (id);
alter table public.certificates add constraint certificates_certificate_number_unique UNIQUE (certificate_number);
alter table public.course_progress add constraint course_progress_pkey PRIMARY KEY (id);
alter table public.courses add constraint courses_pkey PRIMARY KEY (id);
alter table public.enrollments add constraint enrollments_pkey PRIMARY KEY (id);
alter table public.live_classes add constraint live_classes_pkey PRIMARY KEY (id);
alter table public.admin_lockouts add constraint admin_lockouts_pkey PRIMARY KEY (email);
alter table public.profile_children add constraint profile_children_parent_id_child_id_pk PRIMARY KEY (parent_id, child_id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_parent_link_code_unique UNIQUE (parent_link_code);
alter table public.profiles add constraint profiles_referral_code_unique UNIQUE (referral_code);
alter table public.hifz_progress add constraint hifz_progress_pkey PRIMARY KEY (id);
alter table public.quran_bookmarks add constraint quran_bookmarks_pkey PRIMARY KEY (id);
alter table public.quran_memorization_stats add constraint quran_memorization_stats_pkey PRIMARY KEY (user_id);
alter table public.quran_reading_progress add constraint quran_reading_progress_pkey PRIMARY KEY (user_id);
alter table public.coupon_redemptions add constraint coupon_redemptions_coupon_id_user_id_pk PRIMARY KEY (coupon_id, user_id);
alter table public.coupons add constraint coupons_pkey PRIMARY KEY (id);
alter table public.coupons add constraint coupons_code_unique UNIQUE (code);
alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_invoice_number_unique UNIQUE (invoice_number);
alter table public.invoices add constraint invoices_gateway_invoice_id_unique UNIQUE (gateway_invoice_id);
alter table public.manual_payments add constraint manual_payments_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_gateway_order_id_unique UNIQUE (gateway_order_id);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);
alter table public.comments add constraint comments_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.posts add constraint posts_pkey PRIMARY KEY (id);
alter table public.reviews add constraint reviews_pkey PRIMARY KEY (id);
alter table public.rate_limit_counters add constraint rate_limit_counters_bucket_window_start_pk PRIMARY KEY (bucket, window_start);
alter table public.system_audit_log add constraint system_audit_log_pkey PRIMARY KEY (id);
alter table public.system_config add constraint system_config_pkey PRIMARY KEY (key);
alter table public.contact_messages add constraint contact_messages_responded_by_id_profiles_id_fk FOREIGN KEY (responded_by_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.tutor_conversations add constraint tutor_conversations_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.certificates add constraint certificates_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.certificates add constraint certificates_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL;
alter table public.certificates add constraint certificates_issued_by_profiles_id_fk FOREIGN KEY (issued_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.course_progress add constraint course_progress_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.course_progress add constraint course_progress_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.live_classes add constraint live_classes_teacher_id_profiles_id_fk FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.live_classes add constraint live_classes_student_id_profiles_id_fk FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.student_records add constraint student_records_student_id_profiles_id_fk FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.student_records add constraint student_records_teacher_id_profiles_id_fk FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.student_records add constraint student_records_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL;
alter table public.profile_children add constraint profile_children_parent_id_profiles_id_fk FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profile_children add constraint profile_children_child_id_profiles_id_fk FOREIGN KEY (child_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_users_id_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.hifz_progress add constraint hifz_progress_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.quran_bookmarks add constraint quran_bookmarks_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.quran_memorization_stats add constraint quran_memorization_stats_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.quran_reading_progress add constraint quran_reading_progress_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.coupon_redemptions add constraint coupon_redemptions_coupon_id_coupons_id_fk FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE;
alter table public.coupon_redemptions add constraint coupon_redemptions_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.invoices add constraint invoices_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.invoices add constraint invoices_payment_id_payments_id_fk FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
alter table public.manual_payments add constraint manual_payments_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.referrals add constraint referrals_referrer_id_profiles_id_fk FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.referrals add constraint referrals_referee_id_profiles_id_fk FOREIGN KEY (referee_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.comments add constraint comments_post_id_posts_id_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_author_id_profiles_id_fk FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_from_id_profiles_id_fk FOREIGN KEY (from_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_to_id_profiles_id_fk FOREIGN KEY (to_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.post_likes add constraint post_likes_post_id_posts_id_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.post_likes add constraint post_likes_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.posts add constraint posts_author_id_profiles_id_fk FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reviews add constraint reviews_reviewer_id_profiles_id_fk FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reviews add constraint reviews_target_teacher_id_profiles_id_fk FOREIGN KEY (target_teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reviews add constraint reviews_target_course_id_courses_id_fk FOREIGN KEY (target_course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.wishlist_items add constraint wishlist_items_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.wishlist_items add constraint wishlist_items_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
alter table public.system_audit_log add constraint system_audit_log_admin_id_profiles_id_fk FOREIGN KEY (admin_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.system_config add constraint system_config_updated_by_id_profiles_id_fk FOREIGN KEY (updated_by_id) REFERENCES profiles(id) ON DELETE SET NULL;
-- Footer appended to the generated table/constraint DDL: functions,
-- triggers, RLS (enabled, zero policies, matching the real remote
-- finding), grants, and a small amount of synthetic seed data so the
-- backup/restore rehearsal can prove DATA survives too, not just shape.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists rls_auto_enable_trigger;
create event trigger rls_auto_enable_trigger on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' = 'parent' then 'parent'::role
      else 'student'::role
    end
  );
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS enabled, zero policies, on all 34 tables (matches the real finding)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Full CRUD grants to anon/authenticated/service_role (matches the real finding)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('grant select, insert, update, delete, truncate, references, trigger on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- A handful of synthetic, obviously-fake seed rows (no PII) so the
-- backup/restore rehearsal can prove DATA is restored too, not just
-- the schema shape. None of this resembles real user content.
insert into public.blogs (id, title, slug, content, published, views, created_at)
values (gen_random_uuid(), 'Rehearsal fixture post', 'rehearsal-fixture-post', 'synthetic content for the Option A rehearsal only', true, 0, now());

insert into public.subscribers (id, email, status, created_at)
values (gen_random_uuid(), 'rehearsal-fixture@example.invalid', 'active', now());

-- One synthetic auth.users row + its trigger-derived profile, to prove
-- the old handle_new_user()'s metadata-role branching actually ran.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
values (gen_random_uuid(), 'rehearsal-fixture-parent@example.invalid', '{"role":"parent"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');
