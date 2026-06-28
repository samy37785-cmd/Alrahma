export function siteOrigin() {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.split(',')[0].trim();
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}
