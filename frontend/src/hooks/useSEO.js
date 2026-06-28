import { useEffect } from 'react';

/**
 * Central SEO engine. Every public page calls this hook to drive its
 * <head>: title, description, canonical, Open Graph, Twitter Card, robots,
 * an automatic BreadcrumbList, and optional page-specific JSON-LD (Article,
 * Course, …). The app is client-rendered, so these are applied on mount;
 * JS-executing crawlers (e.g. Googlebot) pick them up. The static <head> in
 * index.html carries the baseline Organization/FAQ/WebSite schema + meta.
 *
 * Backward compatible: useSEO({ title, description }) still works.
 */

const SITE = 'AL-Rahma Academy';
const ORIGIN = 'https://al-rahmaacademy.com';
const DEFAULT_IMAGE = `${ORIGIN}/og-cover.jpg`;

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (value == null || value === '') {
    return; // never clobber an existing tag with an empty value
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

// Inject/replace a JSON-LD block tagged with data-seo so we can update or
// remove it on navigation without touching the static schema in index.html.
function setJsonLd(id, obj) {
  const el = document.head.querySelector(`script[data-seo="${id}"]`);
  if (!obj) { if (el) el.remove(); return; }
  if (el) { el.textContent = JSON.stringify(obj); return; }
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.setAttribute('data-seo', id);
  s.textContent = JSON.stringify(obj);
  document.head.appendChild(s);
}

// Build a BreadcrumbList from the URL path. /course/ijazah →
// Home › Course › Ijazah. Returns null on the home page (no breadcrumb).
function buildBreadcrumb(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const items = [{ name: 'Home', url: `${ORIGIN}/` }];
  let acc = '';
  for (const p of parts) {
    acc += `/${p}`;
    const name = decodeURIComponent(p)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ name, url: ORIGIN + acc });
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export default function useSEO({
  title,
  description,
  image,
  type = 'website',
  keywords,
  noindex = false,
  schema,        // page-specific JSON-LD (Article, Course, …) — object or null
  breadcrumb = true,
} = {}) {
  // Stable dependency for the (possibly inline) schema object.
  const schemaKey = schema ? JSON.stringify(schema) : '';

  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE}` : `${SITE} — Learn the Holy Quran Online`;
    const url = ORIGIN + window.location.pathname;
    const img = image || DEFAULT_IMAGE;

    document.title = fullTitle;

    setMeta('name', 'description', description);
    setMeta('name', 'keywords', keywords);
    setMeta(
      'name',
      'robots',
      noindex
        ? 'noindex, nofollow'
        : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
    );

    setLink('canonical', url);

    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:type', type);

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', img);

    setJsonLd('breadcrumb', breadcrumb ? buildBreadcrumb(window.location.pathname) : null);
    setJsonLd('page', schema || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, type, keywords, noindex, breadcrumb, schemaKey]);
}
