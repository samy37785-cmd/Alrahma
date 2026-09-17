// Mirrors backend/routes/liveClassRoutes.js's paths/methods. staffOnly is
// NOT applied here (see liveClassController.js's module comment — Postgres
// has no 'teacher' role; RLS enforces the equivalent is_teacher_of()
// authorization instead). Mounted at /api/classes by app.js only when
// DATA_BACKEND=supabase.
//
// Production-readiness audit follow-up (2026-09-17): this was flagged and
// re-verified. A plain authenticated user (not the target student's real
// assigned teacher, not an AAL2 admin) CANNOT create/update/delete a
// live_classes row through this route — Postgres rejects the write at the
// RLS layer (live_classes_insert_teacher_or_admin/_update_owner_or_admin/
// _delete_owner_or_admin in lib/db/drizzle/0015_new_domains_rls.sql), and
// backend/data/supabase/client.js's withUserContext() genuinely runs every
// query as Postgres role `authenticated` with a real auth.uid() claim, not
// an elevated/service role — so this is a real enforcement boundary, not
// just app-code filtering. Proven with real assertions (not a mocked
// controller) in lib/db/test/rls.local.test.mjs's "live_classes: ..." block
// (insert rejected for a non-teacher; update/delete silently affect 0
// rows; the real assigned teacher still succeeds).
import { Router } from 'express';
import { protect } from '../../../middleware/auth.js';
import { listClasses, createClass, updateClass, deleteClass } from '../liveClassController.js';

const router = Router();

router.use(protect);

router.get('/', listClasses);
router.post('/', createClass);
router.patch('/:id', updateClass);
router.delete('/:id', deleteClass);

export default router;
