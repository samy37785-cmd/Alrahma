# Fresh-start seed scripts (Supabase Readiness Phase 3)

Idempotent, local-first scripts that seed **non-personal, code-sourced**
content into a Postgres database — never old Mongo/production data (see
each script's own header for exactly what it does and does not do).

**Never run against the real Supabase project by these scripts
themselves** — both take `--database-url`/`DATABASE_URL` explicitly and
refuse a non-local host without `sslmode=require`+, but the project owner
is the one who decides when/where to actually run them for real.

## `seed-teachers.mjs`

Seeds `profiles` (is_teacher, name, specialization, bio, gender,
languages, subjects) from the real, owner-approved dataset at
`artifacts/al-rahma-academy/src/data/marketing/teachers.js` — the same
content the public Teachers page already renders.

**Requires `--mapping <path-to-json>`**: a `{ "<teachers.js id>":
"<real email>" }` file. teachers.js has no email for any teacher, so
there is nothing in this codebase that links a marketing-page teacher to
a real Supabase Auth account — **the project owner must supply this
mapping** once each teacher has a real account created (however that
happens — invite, self-signup, etc.). This script never invents an
email or creates an `auth.users`/`profiles` row itself; a teacher with no
mapping entry, or mapped to an email with no existing `profiles` row
yet, is skipped and reported, never silently faked.

**Known schema limitation**: `profiles.bio`/`profiles.specialization`
are single-language `text` columns; teachers.js carries 6 languages.
This script seeds English only. The other 5 languages are not
representable in the schema today — a real gap, not something this
script works around.

```
node seed-teachers.mjs --database-url <url> --mapping ./teacher-emails.json          # dry run
node seed-teachers.mjs --database-url <url> --mapping ./teacher-emails.json --apply   # writes
```

## `seed-courses.mjs`

Inserts a `courses` row per entry in
`artifacts/al-rahma-academy/src/data/marketing/courses.js` (the public
marketing page's own copy) — title/description/icon/tags/resources are
real content; `price_minor` is always `0` and `level` is the schema
default, since courses.js is marketing copy, not catalog pricing/
curriculum data this script has any business inventing.

**Every row this script creates is `published = false`, unconditionally**
— publishing a course is a deliberate, per-course, reviewed decision the
project owner makes after filling in real pricing/level/modules, never
something this script decides for them.

Idempotent by title (courses has no unique constraint on `title` today —
a real one would be a cleaner long-term fix, out of scope here as a
schema change; this script checks before inserting instead).

```
node seed-courses.mjs --database-url <url>            # dry run
node seed-courses.mjs --database-url <url> --apply     # writes (still published=false)
```

## Testing

`node --test fresh-start-seed.test.mjs` — runs both real scripts as
child processes against a disposable local Postgres (needs a running
Docker daemon), covering the dry-run/--apply/idempotency/skip-behavior
described above. Never touches the real Supabase project.
