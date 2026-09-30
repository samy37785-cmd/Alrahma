/**
 * Buffers a Node.js request stream into a single Buffer. Used with
 * `export const config = { api: { bodyParser: false } }` in a Vercel
 * Function so the exact bytes received can be hashed and forwarded
 * unchanged — Vercel's default JSON body-parsing would otherwise parse
 * and re-serialize the body, producing different bytes than what the
 * client actually sent (breaking the HMAC, which signs the raw body hash).
 */
export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
