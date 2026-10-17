// Mirrors backend/routes/contactRoutes.js exactly. Mounted at /api/contact
// by app.js only when DATA_BACKEND=supabase.
import { Router } from 'express';
import { submitContact, contactValidation } from '../contactController.js';

const router = Router();

router.post('/', contactValidation, submitContact);

export default router;
