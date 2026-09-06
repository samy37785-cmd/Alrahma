// Wraps an async route handler so any rejected promise is forwarded to the
// central error handler — removes the repetitive try/catch + next(err) boilerplate
// from every controller.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
