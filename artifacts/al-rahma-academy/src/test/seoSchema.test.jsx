import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import useSEO from '../hooks/useSEO';
import { buildFaqPageSchema } from '../utils/schema';
import en from '../i18n/en.js';

function jsonLdBlocks() {
  return Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => ({ dataSeo: s.getAttribute('data-seo'), json: JSON.parse(s.textContent) }));
}

describe('buildFaqPageSchema', () => {
  it('produces one Question per item, matching the real i18n content exactly', () => {
    const schema = buildFaqPageSchema(en.faq.items);
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(en.faq.items.length);
    schema.mainEntity.forEach((q, i) => {
      expect(q.name).toBe(en.faq.items[i].q);
      expect(q.acceptedAnswer.text).toBe(en.faq.items[i].a);
    });
  });
});

// Regression test for the schema-bleed bug: index.html's static JSON-LD
// (Organization/WebSite) has no data-seo attribute, so useSEO's setJsonLd
// must never touch it; and useSEO's own dynamically-injected blocks
// ('breadcrumb', 'page') must be fully replaced/removed on every navigation,
// never left stacked from a previous page.
describe('useSEO — structured data is scoped per route, not left over from a previous one', () => {
  afterEach(() => {
    document.head.querySelectorAll('script[data-seo], script[data-test-static]').forEach((el) => el.remove());
    document.title = '';
    window.history.pushState({}, '', '/');
  });

  function HomeLike() {
    // Home.jsx doesn't pass `breadcrumb: false` explicitly — buildBreadcrumb
    // naturally returns null for pathname "/" (see useSEO.js), so fidelity
    // to the real component means relying on that, not an explicit override.
    useSEO({
      title: 'Home',
      description: 'Home page',
      schema: buildFaqPageSchema(en.faq.items),
    });
    return null;
  }

  function ContentPageLike() {
    useSEO({
      title: 'Ijazah Course',
      description: 'Course page',
      schema: { '@context': 'https://schema.org', '@type': 'Course', name: 'Ijazah' },
    });
    return null;
  }

  // window.history.pushState mirrors what React Router actually does on a
  // client-side navigation — useSEO's canonical/breadcrumb logic reads
  // window.location.pathname directly, so the URL must really change for
  // this to exercise the same code path a real route change does.
  function goto(path) {
    window.history.pushState({}, '', path);
  }

  it('a static (non-data-seo) tag from index.html is never removed by navigation', () => {
    const staticTag = document.createElement('script');
    staticTag.type = 'application/ld+json';
    staticTag.setAttribute('data-test-static', 'organization');
    staticTag.textContent = JSON.stringify({ '@type': 'Organization', name: 'Al-Rahma Academy' });
    document.head.appendChild(staticTag);

    goto('/');
    const { rerender } = render(<HomeLike />);
    goto('/courses/ijazah');
    rerender(<ContentPageLike />);
    goto('/');
    rerender(<HomeLike />);

    expect(document.head.querySelector('script[data-test-static="organization"]')).not.toBeNull();
  });

  it('navigating from Home to a content page removes FAQPage/adds Course+Breadcrumb, no duplicates', () => {
    goto('/');
    const { rerender } = render(<HomeLike />);
    let blocks = jsonLdBlocks();
    expect(blocks.filter((b) => b.json['@type'] === 'FAQPage')).toHaveLength(1);
    expect(blocks.filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(0);

    goto('/courses/ijazah');
    rerender(<ContentPageLike />);
    blocks = jsonLdBlocks();
    expect(blocks.filter((b) => b.json['@type'] === 'FAQPage')).toHaveLength(0);
    expect(blocks.filter((b) => b.json['@type'] === 'Course')).toHaveLength(1);
    expect(blocks.filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(1);
    // Only one 'page'-tagged block should ever exist at a time.
    expect(blocks.filter((b) => b.dataSeo === 'page')).toHaveLength(1);
  });

  it('navigating back to Home restores FAQPage with no leftover Course/Breadcrumb', () => {
    goto('/');
    const { rerender } = render(<HomeLike />);
    goto('/courses/ijazah');
    rerender(<ContentPageLike />);
    goto('/');
    rerender(<HomeLike />);

    const blocks = jsonLdBlocks();
    expect(blocks.filter((b) => b.json['@type'] === 'FAQPage')).toHaveLength(1);
    expect(blocks.filter((b) => b.json['@type'] === 'Course')).toHaveLength(0);
    expect(blocks.filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(0);
    expect(blocks).toHaveLength(1);
  });
});
