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
 * If the env var is empty or not set, all IPs are allowed (permissive fallback
 * so development works out of the box without extra config).
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

function parseWhitelist() {
  const raw = process.env.ADMIN_IP_WHITELIST ?? '';
  if (!raw.trim()) return null; // null = no restriction
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
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

export function ipWhitelist(req, res, next) {
  const list = parseWhitelist();
  if (!list) return next(); // no whitelist configured — allow all

  const raw = req.ip || req.socket?.remoteAddress || '';
  const ip  = normalizeIp(raw);

  const allowed = list.some((entry) => ipMatchesEntry(ip, entry) || ipMatchesEntry(raw, entry));
  if (allowed) return next();

  return res.status(403).json({
    message: 'Access denied: your IP address is not permitted to access this resource',
  });
}
