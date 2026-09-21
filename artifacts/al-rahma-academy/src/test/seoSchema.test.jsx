import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { buildFaqPageSchema } from '../utils/schema';
import { LangProvider, useLang } from '../context/LangContext';
import { langFromPath } from '../utils/localePath';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import en from '../i18n/en.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Localized Breadcrumb JSON-LD fix (2026-09-21): BreadcrumbList used to be
// built inside useSEO() from the raw URL (decodeURIComponent + Title Case
// per segment) — always English, and frequently mismatched the real page
// title. Breadcrumbs.jsx is now the sole writer of
// `script[data-seo="breadcrumb"]`, built from the exact same `trail`/`label`
// it renders for the visitor, so it can never drift from what's on the
// page. A page that never mounts <Breadcrumbs> (Home) correctly has no
// BreadcrumbList at all.
function wrap(basename, children) {
  return (
    <BrowserRouter basename={basename}>
      <LangProvider>{children}</LangProvider>
    </BrowserRouter>
  );
}

// Fresh mount per call — mirrors src/test/breadcrumbUILabels.test.jsx's
// renderHarness(), the established pattern for rendering a real Breadcrumbs
// (which needs both LangProvider and a Router) at an arbitrary locale/path.
function renderHarness(path_, children) {
  window.history.replaceState({}, '', path_);
  const { basename } = langFromPath(path_);
  return render(wrap(basename, children));
}

describe('useSEO — structured data is scoped per route, not left over from a previous one', () => {
  afterEach(() => {
    cleanup();
    document.head.querySelectorAll('script[data-seo], script[data-test-static]').forEach((el) => el.remove());
    document.title = '';
  });

  function HomeLike() {
    // Home.jsx never renders <Breadcrumbs>, so it correctly has no
    // BreadcrumbList — matches the real component, not an explicit override.
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
    return <Breadcrumbs items={[{ label: 'Courses', to: '/courses' }, { label: 'Ijazah Course' }]} />;
  }

  // window.history.pushState mirrors what React Router actually does on a
  // client-side navigation — useSEO's canonical logic and Breadcrumbs' own
  // URL-building both read window.location.pathname directly, so the URL
  // must really change for this to exercise the same code path a real
  // route change does.
  function goto(path_) {
    window.history.pushState({}, '', path_);
  }

  it('a static (non-data-seo) tag from index.html is never removed by navigation', () => {
    const staticTag = document.createElement('script');
    staticTag.type = 'application/ld+json';
    staticTag.setAttribute('data-test-static', 'organization');
    staticTag.textContent = JSON.stringify({ '@type': 'Organization', name: 'Al-Rahma Academy' });
    document.head.appendChild(staticTag);

    goto('/');
    const { rerender } = render(wrap('', <HomeLike />));
    goto('/courses/ijazah');
    rerender(wrap('', <ContentPageLike />));
    goto('/');
    rerender(wrap('', <HomeLike />));

    expect(document.head.querySelector('script[data-test-static="organization"]')).not.toBeNull();
  });

  it('navigating from Home to a content page removes FAQPage/adds Course+BreadcrumbList, no duplicates', () => {
    goto('/');
    const { rerender } = render(wrap('', <HomeLike />));
    let blocks = jsonLdBlocks();
    expect(blocks.filter((b) => b.json['@type'] === 'FAQPage')).toHaveLength(1);
    expect(blocks.filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(0);

    goto('/courses/ijazah');
    rerender(wrap('', <ContentPageLike />));
    blocks = jsonLdBlocks();
    expect(blocks.filter((b) => b.json['@type'] === 'FAQPage')).toHaveLength(0);
    expect(blocks.filter((b) => b.json['@type'] === 'Course')).toHaveLength(1);
    expect(blocks.filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(1);
    // Only one 'page'-tagged block should ever exist at a time.
    expect(blocks.filter((b) => b.dataSeo === 'page')).toHaveLength(1);
  });

  it('navigating back to Home removes the previous page BreadcrumbList (unmount cleanup), restores FAQPage', () => {
    goto('/');
    const { rerender } = render(wrap('', <HomeLike />));
    goto('/courses/ijazah');
    rerender(wrap('', <ContentPageLike />));
    expect(jsonLdBlocks().filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(1);

    goto('/');
    rerender(wrap('', <HomeLike />));

    const blocks = jsonLdBlocks();
    expect(blocks.filter((b) => b.json['@type'] === 'FAQPage')).toHaveLength(1);
    expect(blocks.filter((b) => b.json['@type'] === 'Course')).toHaveLength(0);
    expect(blocks.filter((b) => b.json['@type'] === 'BreadcrumbList')).toHaveLength(0);
    expect(blocks).toHaveLength(1);
  });
});

describe('Breadcrumbs — BreadcrumbList JSON-LD matches the visible trail exactly, with locale-correct absolute URLs', () => {
  afterEach(() => {
    cleanup();
    document.head.querySelectorAll('script[data-seo]').forEach((el) => el.remove());
    document.title = '';
  });

  function CoursePageLike() {
    const { t } = useLang();
    useSEO({ title: 'Ijazah', description: 'Course page' });
    return <Breadcrumbs items={[{ label: t.nav.courses, to: '/courses' }, { label: 'Ijazah' }]} />;
  }

  function breadcrumbItems() {
    const block = jsonLdBlocks().find((b) => b.json['@type'] === 'BreadcrumbList');
    return block.json.itemListElement;
  }

  function visibleCrumbTexts() {
    return screen.getAllByRole('listitem').map((li) => li.textContent.replace('›', '').trim());
  }

  it('English: /courses/ijazah -> /, /courses, /courses/ijazah; names match the visible trail', () => {
    renderHarness('/courses/ijazah', <CoursePageLike />);
    const items = breadcrumbItems();
    expect(items.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/',
      'https://al-rahmaacademy.com/courses',
      'https://al-rahmaacademy.com/courses/ijazah',
    ]);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items.map((i) => i.name)).toEqual(visibleCrumbTexts());
    expect(items.map((i) => i.name)).toEqual(['Home', 'Courses', 'Ijazah']);
  });

  it('French: /fr/courses/ijazah -> /fr/, /fr/courses, /fr/courses/ijazah - prefix kept in every URL', () => {
    renderHarness('/fr/courses/ijazah', <CoursePageLike />);
    const items = breadcrumbItems();
    expect(items.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/fr/',
      'https://al-rahmaacademy.com/fr/courses',
      'https://al-rahmaacademy.com/fr/courses/ijazah',
    ]);
    expect(items.map((i) => i.name)).toEqual(visibleCrumbTexts());
  });

  it('Arabic: /ar/courses/ijazah -> /ar/, /ar/courses, /ar/courses/ijazah - prefix kept in every URL, names are real Arabic', () => {
    renderHarness('/ar/courses/ijazah', <CoursePageLike />);
    const items = breadcrumbItems();
    expect(items.map((i) => i.item)).toEqual([
      'https://al-rahmaacademy.com/ar/',
      'https://al-rahmaacademy.com/ar/courses',
      'https://al-rahmaacademy.com/ar/courses/ijazah',
    ]);
    // Names literally match what the visitor sees — the exact requirement
    // this fix exists to satisfy, verified against the real DOM text, not a
    // hardcoded expectation of what they "should" be.
    expect(items.map((i) => i.name)).toEqual(visibleCrumbTexts());
    // Home and Courses are real Arabic translations (t.nav.*), not the old
    // URL-derived English (e.g. "Courses").
    expect(items[0].name).not.toMatch(/[a-zA-Z]/);
    expect(items[1].name).not.toMatch(/[a-zA-Z]/);
  });
});

describe('useSEO.js source: no breadcrumb URL-derivation logic remains; setJsonLd is exported for reuse', () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, '../hooks/useSEO.js'), 'utf8');

  it('does not define buildBreadcrumb or derive breadcrumb names from the URL', () => {
    expect(SRC).not.toMatch(/buildBreadcrumb/);
    expect(SRC).not.toMatch(/decodeURIComponent/);
  });

  it('exports setJsonLd so Breadcrumbs.jsx can reuse it instead of duplicating it', () => {
    expect(SRC).toMatch(/export function setJsonLd/);
  });
});
