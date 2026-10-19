// `whatsapp`, the old name for the phone number on POST /api/trials, accepted
// by the Mongo route (routes/trialRoutes.js) ONLY. The shared validator
// (utils/trialValidation.js) and the dormant Supabase route are deliberately
// left as they were: there `whatsapp` is still an unknown field and ignored.
//
// The quick-trial modal and the exit popup sent the visitor's number as
// `whatsapp` until they were changed to send `phone`, and the server dropped
// it, so those numbers were never stored or emailed. A page still open on the
// old bundle keeps sending `whatsapp`.
import { body } from 'express-validator';
import { TRIAL_LIMITS } from '../utils/trialValidation.js';

export const PHONE_MISMATCH_MESSAGE = 'Please send the phone number once: phone and whatsapp differ.';

// The same rules as `phone` in utils/trialValidation.js: optional, a string,
// one line (no C0 control, DEL or U+2028/U+2029), trimmed, at most
// TRIAL_LIMITS.phone characters. tests/trial-form-hardening.test.js checks
// that both fields accept and refuse the same values. Mounted before
// rejectInvalidTrial, so a bad value fails the request exactly like a bad
// `phone` does.
// eslint-disable-next-line no-control-regex
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F\u2028\u2029]/;

export const whatsappValidation = body('whatsapp')
  .optional({ values: 'null' })
  .isString().bail()
  .custom((v) => !SINGLE_LINE_FORBIDDEN.test(v)).bail()
  .trim()
  .isLength({ max: TRIAL_LIMITS.phone });

// Mounted after rejectInvalidTrial: fills req.trialInput.phone from
// `whatsapp` when `phone` is empty. If both are sent and differ after
// trimming, the request is refused rather than guessing which number is
// right; the site's own forms never send both. Nothing is stored under
// `whatsapp`.
export function useWhatsappAsPhone(req, res, next) {
  const { whatsapp } = req.body;
  if (typeof whatsapp !== 'string' || whatsapp === '') return next();
  const { phone } = req.trialInput;
  if (phone && phone !== whatsapp) {
    return res.status(400).json({ message: PHONE_MISMATCH_MESSAGE });
  }
  req.trialInput.phone = whatsapp;
  next();
}
