import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Scope correction (see docs/current-project-status.md): only online CARD
// payment (Stripe/PayPal/Paymob checkout, capture, webhooks, card entry) is
// cancelled — plans, prices, subscriptions and booking all stay. This is a
// static, grep-based inventory guard (same style as
// officialContactSocial.test.js's wa.me/ sweep) proving no card-entry field,
// checkout modal/component, or payment-gateway SDK/script markup has crept
// back into live application source. It does NOT forbid the words
// "payment"/"subscription"/"plan" themselves — those are legitimate booking/
// access-control vocabulary — only concrete gateway/card-entry signatures.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.resolve(__dirname, '..');

const PRODUCTION_SOURCE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts'];
const WALK_EXCLUDE_DIRS = ['test', 'node_modules', 'coverage', 'dist', 'generated'];

function walk(dir, exts, exclude) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.some((x) => entry.name === x)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts, exclude));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR, PRODUCTION_SOURCE_EXTS, WALK_EXCLUDE_DIRS);

// Concrete card-entry / gateway-execution signatures — not the general
// English words "payment", "plan", "subscription", "billing", which are
// legitimate product vocabulary for the booking/subscription system that
// deliberately stays.
const FORBIDDEN_PATTERNS = [
  { name: 'card number field', re: /cardNumber/i },
  { name: 'CVV/CVC field', re: /\bcvv\b|\bcvc\b/i },
  { name: 'card expiry field', re: /expiryDate|cardExpiry|expMonth|expYear/i },
  { name: 'Stripe Elements/CardElement', re: /CardElement|stripe\.elements|loadStripe/i },
  { name: 'PayPal Buttons SDK', re: /PayPalButtons|paypal\.Buttons/i },
  { name: 'checkout modal component/class', re: /CheckoutModal|checkout-modal|modal__card\.checkout/i },
  { name: 'Stripe/PayPal/Paymob SDK script tag', re: /js\.stripe\.com|paypal\.com\/sdk\/js|paymob\.com/i },
  { name: 'billing address form field', re: /billingAddress/i },
];

describe('no card-entry field, checkout modal, or payment-gateway SDK markup exists in live application source', () => {
  it.each(files)('%s contains no forbidden card/checkout-gateway markup', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      expect(src, `${path.relative(SRC_DIR, file)} matched forbidden pattern "${name}"`).not.toMatch(re);
    }
  });

  it('index.html loads no Stripe/PayPal/Paymob SDK script', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/js\.stripe\.com/i);
    expect(html).not.toMatch(/paypal\.com\/sdk\/js/i);
    expect(html).not.toMatch(/paymob\.com/i);
  });

  it('no package.json in this app depends on a card-gateway client SDK', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const gatewayPkgs = Object.keys(deps).filter((d) =>
      /stripe|paypal|paymob/i.test(d),
    );
    expect(gatewayPkgs, `unexpected gateway SDK dependency: ${JSON.stringify(gatewayPkgs)}`).toEqual([]);
  });
});
