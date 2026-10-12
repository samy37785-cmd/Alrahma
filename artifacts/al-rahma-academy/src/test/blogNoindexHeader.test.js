import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The blog has no published posts yet (the API returns 0 for every locale),
// so /resources/blog is a near-empty page. Bing and the AI crawlers read the
// raw HTML without running the app, so a robots meta set by useSEO() after
// render never reaches them. vercel.json therefore sends
// `X-Robots-Tag: noindex, follow` on every blog URL until the blog launches.
// Remove the header rule (and this test) in the PR that publishes posts.

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelConfig = JSON.parse(readFileSync(path.resolve(appRoot, '../../vercel.json'), 'utf8'));
const read = (rel) => readFileSync(path.resolve(appRoot, rel), 'utf8');

// Same compilation as Vercel's path-to-regexp for `/:path(<pattern>)`
// (strict: false, sensitive: false), as in spaShell.test.js.
const rules = vercelConfig.headers || [];
const blogRule = rules.find((r) => r.headers.some((h) => h.key === 'X-Robots-Tag'));
const pattern = blogRule?.source.match(/^\/:path\((.*)\)$/)?.[1];
const matcher = pattern ? new RegExp(`^/(?:${pattern})/?$`, 'i') : null;
const noindexed = (p) => !!matcher && matcher.test(p);

describe('vercel.json: blog pages are noindex until the blog launches', () => {
  it('has exactly one header rule: X-Robots-Tag "noindex, follow"', () => {
    expect(rules).toHaveLength(1);
    expect(blogRule).toBeTruthy();
    expect(blogRule.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex, follow' }]);
    expect(matcher).toBeTruthy();
  });

  it('covers the blog index, posts and the legacy /blog URLs in every locale', () => {
    for (const prefix of ['', '/ar', '/fr', '/it', '/es', '/de']) {
      for (const p of ['/resources/blog', '/resources/blog/', '/resources/blog/some-post', '/blog', '/blog/some-post']) {
        expect(noindexed(`${prefix}${p}`), `${prefix}${p}`).toBe(true);
      }
    }
  });

  it('touches no other page', () => {
    for (const p of [
      '/', '/it/', '/resources', '/it/resources', '/resources/faq', '/it/resources/faq',
      '/courses/quran', '/tools/prayer', '/it/tools/prayer-times', '/academy/teachers/1',
      '/blogger', '/resources/blogs', '/resources/blog/a/b', '/api/blog', '/enroll',
      '/xx/resources/blog', '/sitemap.xml', '/robots.txt',
    ]) {
      expect(noindexed(p), p).toBe(false);
    }
  });

  it('no blog URL is published in the sitemap or llms.txt', () => {
    expect(read('public/sitemap.xml')).not.toMatch(/\/blog\b/);
    expect(read('public/llms.txt')).not.toMatch(/\/blog\b/);
  });
});
