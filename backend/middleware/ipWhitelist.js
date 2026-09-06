/**
 * IP whitelist guard for the admin API.
 *
 * Controlled via the ADMIN_IP_WHITELIST environment variable:
 *   ADMIN_IP_WHITELIST="1.2.3.4,::1,10.0.0.0/8"
 *
 * Supports:
 *  - Exact IPv4 / IPv6 matches  (e.g. "192.168.1.1", "::1")
 *  - IPv4 CIDR ranges            (e.g. "10.0.0.0/8", "192.168.0.0/24")
 *
 * If the env var is empty or not set:
 *  - In development/test: all IPs are allowed (permissive fallback so local
 *    dev works out of the box without extra config).
 *  - In production: ALL requests are denied (fail closed). A misconfigured
 *    production deploy must not silently lose this control by defaulting to
 *    "allow everyone" — see T21 security audit. If this surfaces in practice,
 *    set ADMIN_IP_WHITELIST in the deployment environment; this is not a bug
 *    to work around by reverting to the permissive default.
 *
 * The whitelist is parsed once at module load, not on every request.
 * Under serverless each cold start pays the parse cost once and every
 * subsequent warm request reads from the cached array.
 */

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function cidrContainsIpv4(cidr, ip) {
  const [base, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  try {
    const mask    = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const network = (ipv4ToInt(base) & mask) >>> 0;
    const target  = (ipv4ToInt(ip)   & mask) >>> 0;
    return network === target;
  } catch {
    return false;
  }
}

function isValidIpv4(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((o) => +o <= 255);
}

function normalizeIp(ip) {
  if (!ip) return '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip; // strip IPv6-mapped IPv4 prefix
}

function ipMatchesEntry(ip, entry) {
  if (entry.includes('/')) {
    // CIDR — only IPv4 implemented natively; ignore IPv6 CIDRs (allow if not matched)
    if (isValidIpv4(ip) && isValidIpv4(entry.split('/')[0])) {
      return cidrContainsIpv4(entry, ip);
    }
    return false;
  }
  return ip === entry;
}

// Parse once at module evaluation — env vars are immutable at runtime.
// null = no whitelist configured (allow all).
const _whitelist = (() => {
  const raw = process.env.ADMIN_IP_WHITELIST ?? '';
  if (!raw.trim()) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
})();

export function ipWhitelist(req, res, next) {
  if (!_whitelist) {
    // No whitelist configured. In production this must fail closed — silently
    // allowing all IPs would mean a missing env var quietly disables the
    // entire admin IP control instead of surfacing as an outage to fix.
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        message: 'Access denied: your IP address is not permitted to access this resource',
      });
    }
    return next(); // dev/test — allow all, unchanged from before
  }

  const raw = req.ip || req.socket?.remoteAddress || '';
  const ip  = normalizeIp(raw);

  const allowed = _whitelist.some((entry) => ipMatchesEntry(ip, entry) || ipMatchesEntry(raw, entry));
  if (allowed) return next();

  return res.status(403).json({
    message: 'Access denied: your IP address is not permitted to access this resource',
  });
}