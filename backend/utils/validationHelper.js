import { validationResult } from 'express-validator';

/**
 * Checks express-validator results and sends a 422 response with the error
 * array if any validation failed. Returns true when errors were found so the
 * caller can `return` immediately after calling this.
 *
 * Usage:
 *   if (handleValidationErrors(req, res)) return;
 */
export function handleValidationErrors(req, res) {
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    res.status(422).json({ errors: errs.array() });
    return true;
  }
  return false;
}
