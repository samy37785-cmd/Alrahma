import { useEffect } from 'react';
import { langFromPath, stripLangPrefix, pathFor, hreflangSetFor, OG_LOCALE_MAP, ORIGIN } from '../utils/localePath';
import { LANGS } from '../i18n';

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
const DEFAULT_IMAGE = `${ORIGIN}/og-cover.svg`;

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

// Fully replaces every <link rel="alternate" hreflang> in the document —
// there's one per language plus x-default, so (unlike setLink's single
// element) this always removes-and-rebuilds the whole set rather than
// patching one. Needed on every navigation, not just first mount: without
// this, hreflang was only ever set at build time (prerender.mjs) or as a
// static dev-only fallback in index.html, so a client-side <Link> navigation
// left every hreflang tag pointing at the page you navigated away from.
function setHreflang(route) {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  for (const { hreflang, href } of hreflangSetFor(route)) {
    const el = document.createElement('link');
    el.rel = 'alternate';
    el.hreflang = hreflang;
    el.href = href;
    document.head.appendChild(el);
  }
}

// Like setJsonLd: fully replaces every meta[attr=key] element, since
// og:locale:alternate is legitimately repeated (one tag per non-current
// language) — setMeta's single-querySelector update can't represent that.
// Also clears index.html's static og:locale/og:locale:alternate defaults on
// first run, since those share the same property and would otherwise linger
// duplicated alongside the runtime-correct ones.
function setMultiMeta(attr, key, values) {
  document.head.querySelectorAll(`meta[${attr}="${key}"]`).forEach((el) => el.remove());
  for (const value of values) {
    const el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute('content', value);
    document.head.appendChild(el);
  }
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
  // Strip a leading language segment first for the label/level walk —
  // otherwise a real prefixed URL like /fr/courses/ijazah would render
  // "Fr › Courses › Ijazah", turning the language code itself into a
  // spurious first breadcrumb crumb — but each level's own `item` URL still
  // needs to carry that same prefix back (via pathFor), so a French page's
  // breadcrumb doesn't point at the English URLs.
  const { lang } = langFromPath(pathname);
  const parts = stripLangPrefix(pathname).split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const items = [{ name: 'Home', url: ORIGIN + pathFor('/', lang || 'en') }];
  let acc = '';
  for (const p of parts) {
    acc += `/${p}`;
    const name = decodeURIComponent(p)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ name, url: ORIGIN + pathFor(acc, lang || 'en') });
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

    const { lang: currentLang } = langFromPath(window.location.pathname);
    const lang = currentLang || 'en';
    setHreflang(stripLangPrefix(window.location.pathname));
    setMeta('property', 'og:locale', OG_LOCALE_MAP[lang]);
    setMultiMeta('property', 'og:locale:alternate', LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE_MAP[l]));

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
