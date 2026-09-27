import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_LOCALES } from '../models/Blog.js';
import { LOCALES as SUPABASE_BLOG_LOCALES } from '../data/supabase/blogController.js';

// Blog SEO Foundation PR A: Mongo/Supabase parity check for the locale
// contract. Mongo's backend/models/Blog.js and Supabase's
// backend/data/supabase/blogController.js each define their own locale
// allow-list independently (by design — the Supabase controller has zero
// dependencies on the Mongo model tree, matching this codebase's existing
// self-contained-SQL convention for that file). This test is the one place
// that proves those two independent definitions never silently drift apart.
// No database of either kind is touched — this only imports plain constants.

test('Mongo and Supabase blog controllers agree on the exact same locale allow-list', () => {
  assert.deepEqual([...BLOG_LOCALES].sort(), [...SUPABASE_BLOG_LOCALES].sort());
});

test('the shared locale allow-list is exactly en/ar for this phase (it/fr/es/de are out of scope)', () => {
  assert.deepEqual([...BLOG_LOCALES].sort(), ['ar', 'en']);
});
