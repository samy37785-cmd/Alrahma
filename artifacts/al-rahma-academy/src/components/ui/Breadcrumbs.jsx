import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';
import { homeHref, ORIGIN, pathFor } from '../../utils/localePath';
import { setJsonLd } from '../../hooks/useSEO';

/**
 * Visible breadcrumb trail — AND the single writer of the matching
 * BreadcrumbList JSON-LD (`script[data-seo="breadcrumb"]`, via the same
 * setJsonLd() useSEO.js itself uses). useSEO.js used to derive that schema
 * independently from the raw URL (decodeURIComponent + Title Case on each
 * path segment), which meant it was always English regardless of the
 * page's real language and frequently didn't match the real page title
 * either (e.g. "/courses/ijazah" → "Ijazah", not "Quran Ijazah Course") —
 * found live on production across every /ar/... page in the Localized
 * Breadcrumb JSON-LD Discovery. Building the schema here instead, from the
 * exact same `trail` array this component already renders for the
 * visitor, makes drift structurally impossible: there is only one array,
 * read twice (once for the DOM, once for JSON-LD), not two independently
 * maintained sources.
 *
 * A page that never mounts <Breadcrumbs> (Home, and a few auth/utility
 * pages with no visible breadcrumb) correctly gets no BreadcrumbList at
 * all — schema now always matches what's actually on the page, instead of
 * every page silently getting one whether or not it had a visible trail.
 *
 * Pass the trail AFTER Home; the "Home" crumb is prepended and localised here.
 * The last item is rendered as the current page (not a link).
 *
 *   <Breadcrumbs items={[{ label: 'Blog', to: '/blog' }, { label: post.title }]} />
 */
export default function Breadcrumbs({ items = [] }) {
  const { t, lang } = useLang();
  const copy = getExperienceText(lang).ui;
  const homeLabel = t?.nav?.home || copy.home;
  const trail = [{ label: homeLabel, to: '/' }, ...items];

  // Stable dependency for the items array (a new literal every render).
  const itemsKey = JSON.stringify(items);

  useEffect(() => {
    const itemListElement = trail.map((it, i) => {
      const last = i === trail.length - 1;
      // Same "is this the current, unlinked crumb" condition the render
      // below uses (last, or no `to` at all) — a crumb with no `to` has no
      // app-relative path to resolve, so its URL is simply where the
      // visitor already is. Every other crumb's `to` is an app-relative,
      // unprefixed path (e.g. "/courses"); pathFor() is the same single
      // source of truth used everywhere else in the app for turning that
      // into the real locale-prefixed absolute URL.
      const isCurrent = last || !it.to;
      const url = isCurrent ? ORIGIN + window.location.pathname : ORIGIN + pathFor(it.to, lang);
      return { '@type': 'ListItem', position: i + 1, name: it.label, item: url };
    });
    setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement,
    });
    // Runs on unmount (navigating to a page that doesn't render
    // <Breadcrumbs>, e.g. Home) and before every re-run — never leaves a
    // previous page's BreadcrumbList behind.
    return () => setJsonLd('breadcrumb', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, homeLabel, itemsKey]);

  return (
    <nav className="breadcrumbs" aria-label={copy.breadcrumb}>
      <div className="container">
        <ol className="breadcrumbs__list">
          {trail.map((it, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={i} className="breadcrumbs__item">
                {last || !it.to
                  ? <span className="breadcrumbs__current" aria-current="page" aria-label={`${copy.currentPage}: ${it.label}`}>{it.label}</span>
                  // The Home crumb's target is "/" — react-router can't render
                  // that correctly via <Link> under a non-English basename
                  // (see utils/localePath.js's homeHref() comment), so it needs
                  // a raw <a href>. Every other crumb is a plain app-relative
                  // path (e.g. "/blog"), which basename already resolves
                  // correctly through a normal <Link>.
                  : it.to === '/'
                    ? <a className="breadcrumbs__link" href={homeHref()}>{it.label}</a>
                    : <Link className="breadcrumbs__link" to={it.to}>{it.label}</Link>}
                {!last && <span className="breadcrumbs__sep" aria-hidden="true">›</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
