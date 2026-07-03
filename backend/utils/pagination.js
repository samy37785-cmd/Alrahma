/**
 * Parses page/limit query params and returns { page, limit, skip }.
 *
 * @param {object} query      - req.query (or any object with .page / .limit)
 * @param {object} [options]
 * @param {number} [options.defaultLimit=50]
 * @param {number} [options.maxLimit=500]
 */
export function parsePagination(query, options = {}) {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit     = options.maxLimit     ?? 500;

  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const skip  = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Sends the standard paginated JSON envelope.
 */
export function sendPaginated(res, { data, total, page, limit }) {
  return res.json({ data, total, page, pages: Math.ceil(total / limit) });
}
