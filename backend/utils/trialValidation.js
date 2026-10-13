// Shared server-side validation for POST /api/trials, used by BOTH the Mongo
// route (routes/trialRoutes.js) and the Supabase route
// (data/supabase/routes/trialRoutes.js) so the two backends accept exactly
// the same input.
//
// The submitted email is later used as a mail recipient (student
// confirmation) and as the admin notification's Reply-To, so it must be
// exactly ONE plain address: no lists, no display names, no groups, no line
// breaks. validator.js isEmail (via express-validator) is the source of
// truth; Nodemailer's own address parser is a second, independent check that
// the value is read as a single bare address by the library that sends it.
import { body, validationResult } from 'express-validator';
import addressparser from 'nodemailer/lib/addressparser/index.js';

export const TRIAL_LIMITS = Object.freeze({
  name: 100,
  email: 254,
  phone: 30,
  course: 100,
  message: 2000,
});

// Any C0 control character, DEL, or Unicode line/paragraph separator.
// (Matching control characters is the whole point of these two patterns.)
// eslint-disable-next-line no-control-regex
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F\u2028\u2029]/;
// Multi-line free text may keep tab/LF/CR; every other control is rejected.
// eslint-disable-next-line no-control-regex
const MULTI_LINE_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// Characters that have list/display-name/comment meaning in address syntax.
const ADDRESS_SYNTAX_CHARS = /[\s,;<>"()[\]\\:]/;

export const INVALID_TRIAL_MESSAGE =
  'Please enter one valid email address and keep each field within its length limit.';
export const MISSING_TRIAL_MESSAGE = 'Name and email are required';

export function isSingleBareAddress(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.length > TRIAL_LIMITS.email) return false;
  if (SINGLE_LINE_FORBIDDEN.test(value) || ADDRESS_SYNTAX_CHARS.test(value)) return false;
  const parsed = addressparser(value);
  return (
    parsed.length === 1 &&
    !parsed[0].group &&
    parsed[0].name === '' &&
    parsed[0].address === value
  );
}

// The forbidden-character check runs on the RAW value, before trim(): a
// control character or line break anywhere in a single-line field —
// including leading/trailing — rejects the request rather than being
// silently stripped. trim() then only removes ordinary edge whitespace.
// (Validators and sanitizers in a chain run in the order declared.)
const rejectChars = (forbidden) => (v) => !forbidden.test(v);

const optionalText = (field, max, forbidden) =>
  body(field)
    .optional({ values: 'null' })
    .isString().bail()
    .custom(rejectChars(forbidden)).bail()
    .trim()
    .isLength({ max });

export const trialValidation = [
  body('name')
    .exists({ values: 'falsy' }).withMessage(MISSING_TRIAL_MESSAGE).bail()
    .isString().bail()
    .custom(rejectChars(SINGLE_LINE_FORBIDDEN)).bail()
    .trim()
    .isLength({ min: 1, max: TRIAL_LIMITS.name }),
  body('email')
    .exists({ values: 'falsy' }).withMessage(MISSING_TRIAL_MESSAGE).bail()
    .isString().bail()
    .custom(rejectChars(SINGLE_LINE_FORBIDDEN)).bail()
    .trim()
    .isLength({ max: TRIAL_LIMITS.email }).bail()
    .isEmail({
      allow_display_name: false,
      require_display_name: false,
      allow_utf8_local_part: false,
      require_tld: true,
      allow_ip_domain: false,
    }).bail()
    .custom(isSingleBareAddress),
  optionalText('phone', TRIAL_LIMITS.phone, SINGLE_LINE_FORBIDDEN),
  optionalText('course', TRIAL_LIMITS.course, SINGLE_LINE_FORBIDDEN),
  optionalText('message', TRIAL_LIMITS.message, MULTI_LINE_FORBIDDEN),
];

// Ends the request with 400 on any failure (the status this endpoint has
// always used for bad input). On success, exposes ONLY the five accepted
// fields, trimmed, as req.trialInput — controllers must read from there,
// never from req.body. Unknown extra fields (e.g. `source`, `whatsapp` sent
// by some forms) are ignored exactly as before.
export function rejectInvalidTrial(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const missing = errors.array().some((e) => e.msg === MISSING_TRIAL_MESSAGE);
    return res.status(400).json({ message: missing ? MISSING_TRIAL_MESSAGE : INVALID_TRIAL_MESSAGE });
  }
  const pick = (k) => (typeof req.body[k] === 'string' && req.body[k] !== '' ? req.body[k] : null);
  req.trialInput = {
    name: req.body.name,
    email: req.body.email,
    phone: pick('phone'),
    course: pick('course'),
    message: pick('message'),
  };
  next();
}
