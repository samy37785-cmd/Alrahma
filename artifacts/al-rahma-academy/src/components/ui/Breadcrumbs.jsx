import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';

/**
 * Visible breadcrumb trail. The matching BreadcrumbList JSON-LD is emitted
 * separately by the useSEO hook, so this is purely the on-page UI.
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
