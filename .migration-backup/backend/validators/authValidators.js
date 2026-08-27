import { body } from 'express-validator';

// Deliberately does NOT use express-validator's .normalizeEmail() — that
// sanitizer applies provider-specific rewrites (e.g. stripping dots/+tags
// from Gmail addresses) that would silently change what email a user
// actually registers with. .isEmail() here is a pure format gate; the
// controller's normEmail() remains the only source of normalization.
export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('A valid email is required'),
  body('password').isString().withMessage('Password is required').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// login only needs to guard against malformed *types* reaching
// user.matchPassword() — bcrypt.compare() throws (not a clean 401) if
// password isn't a string, e.g. a request with no password field at all, or
// password sent as a number/object/array. This does not change behavior for
// any well-formed request: correct/incorrect credentials still resolve to
// the same 200/401 as before.
export const loginValidation = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('A valid email is required'),
  body('password').isString().withMessage('Password is required').notEmpty().withMessage('Password is required'),
];
