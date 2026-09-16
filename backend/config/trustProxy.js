/**
 * Express "trust proxy" setting — controlled via the TRUST_PROXY environment
 * variable, deliberately NOT a hop-count number.
 *
 * A numeric hop count (Express's `app.set('trust proxy', 1)`) trusts the
 * Nth-from-the-right X-Forwarded-For entry unconditionally, regardless of
 * which IP actually sent it — it is correct only if every deployment path to
 * this app always has exactly that many proxies in front of it. This app has
 * (at least) two real paths: direct-to-Render (1 hop) and via the Vercel
 * edge rewrite in front of Render (2 hops) — a single fixed number is wrong
 * for one of them either way, and wrong-in-the-permissive-direction means an
 * attacker hitting the app directly can inject a fake X-Forwarded-For that
 * Express will trust as the real client IP, defeating ipWhitelist.js and
 * every rate limiter (see config/rateLimit.js / config/adminRateLimits.js),
 * both of which key entirely off req.ip.
 *
 * TRUST_PROXY instead accepts:
 *   - unset / "" / "false"  → `false` (trust nothing; req.ip is always the
 *     raw socket peer — the SAFE DEFAULT, and the only value this app will
 *     use until an operator has confirmed the real ingress IPs/CIDRs).
 *   - a comma-separated list of IPs/CIDRs (IPv4 or IPv6), e.g.
 *     "TRUST_PROXY=100.64.0.0/10,2600:1f18::/32" → Express/proxy-addr walks
 *     X-Forwarded-For from the right, trusting an entry only while the peer
 *     that appended it matches one of these — an X-Forwarded-For value
 *     injected by anyone NOT in this list is never trusted, regardless of
 *     how many hops are present. This is what makes it safe: it verifies by
 *     identity, not by counting.
 *
 * A bare integer (e.g. "1", "2") is explicitly rejected — hop-count mode is
 * intentionally not supported here; see the module comment above for why.
 */

import logger from './logger.js';

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_RE = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);
// Deliberately permissive IPv6 shape check (full RFC 4291 validation is not
// worth reimplementing here) — good enough to catch obvious typos; Express's
// own proxy-addr/ipaddr.js does the authoritative parsing at request time.
// Also accepts IPv4-mapped IPv6 notation (e.g. "::ffff:127.0.0.1") — the
// form Node itself reports for an IPv4 peer on a dual-stack socket, so an
// operator copying req.ip straight out of a log line must not be rejected.
const IPV6_RE = new RegExp(`^[0-9a-fA-F:]+:(${IPV4_OCTET}(\\.${IPV4_OCTET}){3}|[0-9a-fA-F:]*)$`);
const BARE_INTEGER_RE = /^\d+$/;

function isValidIpOrCidr(entry) {
  const [addr, prefixStr] = entry.split('/');
  if (prefixStr !== undefined) {
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix)) return false;
    if (IPV4_RE.test(addr)) return prefix >= 0 && prefix <= 32;
    if (IPV6_RE.test(addr)) return prefix >= 0 && prefix <= 128;
    return false;
  }
  return IPV4_RE.test(addr) || IPV6_RE.test(addr);
}

export function getTrustProxySetting() {
  const raw = (process.env.TRUST_PROXY ?? '').trim();

  if (!raw || raw.toLowerCase() === 'false') {
    return false;
  }

  if (BARE_INTEGER_RE.test(raw)) {
    throw new Error(
      `Invalid TRUST_PROXY="${raw}" — a bare hop count is not supported (a fixed number is wrong for at ` +
      'least one of this app\'s real deployment paths and can let an attacker spoof X-Forwarded-For). ' +
      'Set TRUST_PROXY to a comma-separated list of the actual trusted proxy IPs/CIDRs instead, e.g. ' +
      '"TRUST_PROXY=100.64.0.0/10", or leave it unset to trust nothing (the safe default).'
    );
  }

  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const invalid = entries.filter((e) => !isValidIpOrCidr(e));
  if (invalid.length) {
    throw new Error(
      `Invalid TRUST_PROXY entries: ${invalid.join(', ')} — each entry must be a valid IPv4/IPv6 address ` +
      'or CIDR range.'
    );
  }

  logger.info('Trust proxy configured', { trustedProxies: entries });
  return entries;
}
