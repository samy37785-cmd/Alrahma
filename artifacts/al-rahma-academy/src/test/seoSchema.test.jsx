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

// Stage 1 URL Closure (see docs/localization-audit.md): buildBreadcrumb()
// correctly stripped the locale prefix from each crumb's NAME (so a French
// page never showed a spurious "Fr" breadcrumb) but then built every
// crumb's URL from that same locale-stripped path — silently dropping the
// prefix from the URL too, so a French page's BreadcrumbList pointed
// entirely at the English URLs. Fixed by rebuilding each URL via
// pathFor(), the same canonical-path builder used everywhere else in the
// app, so this can never drift from the redirect policy again.
describe('useSEO — BreadcrumbList URLs keep the locale prefix; names never show it', () => {
  afterEach(() => {
    document.head.querySelectorAll('script[data-seo]').forEach((el) => el.remove());
    document.title = '';
    window.history.pushState({}, '', '/');
  });

  function CoursePageLike() {
    useSEO({ title: 'Ijazah', description: 'Course page' });
    return null;
  }

  function breadcrumbItems() {
    const block = jsonLdBlocks().find((b) => b.json['@type'] === 'BreadcrumbList');
    return block.json.itemListElement;
  }

  it('English: /courses/ijazah -> /, /courses, /courses/ijazah', () => {
    window.history.pushState({}, '', '/courses/ijazah');
    render(<CoursePageLike />);
    const items = breadcrumbItems();
    expect(items.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/',
      'https://al-rahmaacademy.com/courses',
      'https://al-rahmaacademy.com/courses/ijazah',
    ]);
    expect(items.map((i) => i.name)).toEqual(['Home', 'Courses', 'Ijazah']);
  });

  it('French: /fr/courses/ijazah -> /fr/, /fr/courses, /fr/courses/ijazah - prefix kept in every URL', () => {
    window.history.pushState({}, '', '/fr/courses/ijazah');
    render(<CoursePageLike />);
    const items = breadcrumbItems();
    expect(items.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/fr/',
      'https://al-rahmaacademy.com/fr/courses',
      'https://al-rahmaacademy.com/fr/courses/ijazah',
    ]);
    // Names never show the locale segment as its own crumb.
    expect(items.map((i) => i.name)).toEqual(['Home', 'Courses', 'Ijazah']);
    expect(items.map((i) => i.name)).not.toContain('Fr');
  });

  it('Arabic: /ar/courses/ijazah -> /ar/, /ar/courses, /ar/courses/ijazah - prefix kept in every URL', () => {
    window.history.pushState({}, '', '/ar/courses/ijazah');
    render(<CoursePageLike />);
    const items = breadcrumbItems();
    expect(items.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/ar/',
      'https://al-rahmaacademy.com/ar/courses',
      'https://al-rahmaacademy.com/ar/courses/ijazah',
    ]);
    expect(items.map((i) => i.name)).toEqual(['Home', 'Courses', 'Ijazah']);
    expect(items.map((i) => i.name)).not.toContain('Ar');
  });
});
