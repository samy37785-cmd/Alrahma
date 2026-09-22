import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// robots.txt fix: /wishlist, /ai-tutor, /community and /calendar are
// member-only, ProtectedRoute-gated pages (real access control is the
// route guard, never robots.txt) that were missing an explicit
// Disallow rule alongside the site's other protected routes
// (/admin, /dashboard, /billing, /profile, /messages, ...). This only
// adds the four missing rules; every existing rule is untouched.

const robotsTxt = fs.readFileSync(
  path.resolve(__dirname, '../../public/robots.txt'),
  'utf8',
);

describe('robots.txt: protected member routes', () => {
  it('contains exactly the four newly-required Disallow rules', () => {
    expect(robotsTxt).toMatch(/^Disallow: \/wishlist$/m);
    expect(robotsTxt).toMatch(/^Disallow: \/ai-tutor$/m);
    expect(robotsTxt).toMatch(/^Disallow: \/community$/m);
    expect(robotsTxt).toMatch(/^Disallow: \/calendar$/m);
  });

  it('keeps every pre-existing Disallow rule unchanged', () => {
    const existing = [
      '/admin',
      '/dashboard',
      '/billing',
      '/profile',
      '/messages',
      '/teacher',
      '/parent',
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password',
      '/payment/',
      '/sessions',
    ];
    for (const route of existing) {
      expect(robotsTxt).toMatch(new RegExp(`^Disallow: ${route.replace('/', '\\/')}$`, 'm'));
    }
  });

  it('does not disallow /courses — public course pages must stay crawlable', () => {
    expect(robotsTxt).not.toMatch(/^Disallow: \/courses$/m);
  });

  it('keeps the sitemap directive untouched', () => {
    expect(robotsTxt).toMatch(/^Sitemap: https:\/\/al-rahmaacademy\.com\/sitemap\.xml$/m);
  });

  it('keeps User-agent: * as the only user-agent block', () => {
    const uaLines = robotsTxt.match(/^User-agent:.*$/gm) || [];
    expect(uaLines).toEqual(['User-agent: *']);
  });
});
