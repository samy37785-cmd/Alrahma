import { describe, it, expect } from 'vitest';
import { isAssetOrApiPath } from '../utils/assetOrApiPath';

// Stage 1 URL Closure (see docs/localization-audit.md, Section 9 item 27):
// assets and API paths must never be touched by the trailing-slash/legacy
// -lang canonical-redirect middleware in vite.config.ts.
describe('isAssetOrApiPath', () => {
  it('27. flags real static assets', () => {
    expect(isAssetOrApiPath('/favicon.svg')).toBe(true);
    expect(isAssetOrApiPath('/robots.txt')).toBe(true);
    expect(isAssetOrApiPath('/sitemap.xml')).toBe(true);
    expect(isAssetOrApiPath('/assets/index-abc123.js')).toBe(true);
    expect(isAssetOrApiPath('/manifest.json')).toBe(true);
  });

  it('27. flags API paths', () => {
    expect(isAssetOrApiPath('/api/healthz')).toBe(true);
    expect(isAssetOrApiPath('/api/v1/admin/users')).toBe(true);
  });

  it('never flags real app routes, including ones needing trailing-slash normalization', () => {
    expect(isAssetOrApiPath('/')).toBe(false);
    expect(isAssetOrApiPath('/fr')).toBe(false);
    expect(isAssetOrApiPath('/fr/')).toBe(false);
    expect(isAssetOrApiPath('/courses/ijazah')).toBe(false);
    expect(isAssetOrApiPath('/courses/')).toBe(false);
    expect(isAssetOrApiPath('/fr/resources/faq')).toBe(false);
  });
});
