import { validationResult } from 'express-validator';

/**
 * Checks express-validator results and sends a 422 response if any
 * validation failed. Returns true when errors were found so the caller can
 * `return` immediately after calling this.
 *
 * The response body is `{ message: "..." }` — every other error response in
 * this API (manual checks, the global errorHandler, Mongoose ValidationError)
 * uses that exact shape, so this joins express-validator's error array into
 * one string rather than exposing a differently-shaped `{ errors: [...] }`
 * body (T9: no frontend code anywhere reads `.errors`; this was a latent
 * inconsistency, not something any client depends on).
 *
 * Usage:
 *   if (handleValidationErrors(req, res)) return;
 */
export function handleValidationErrors(req, res) {
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    const message = errs.array().map((e) => e.msg).join(', ');
    res.status(422).json({ message });
    return true;
  }
  return false;
}
