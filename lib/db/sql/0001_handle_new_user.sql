-- Stage 1 (docs/render-to-supabase-migration.md): public-registration role
-- restriction. Was enforced in `.migration-backup/backend/controllers/
-- authController.js:76` (`role === 'parent' ? 'parent' : 'student'`) — a
-- client can never self-register as 'teacher' or 'admin' no matter what it
-- sends. Ported here as a trigger on auth.users insert rather than trusted
-- client-side logic, since Stage 5 has the frontend call Supabase Auth's
-- signUp() directly (no Express controller sits in between to enforce this
-- anymore).
--
-- Not run via drizzle-kit push (it only manages schema-derived DDL, not
-- functions/triggers) — applied directly, tracked here for repeatability.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
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
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
