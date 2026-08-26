import { useLocation } from 'react-router-dom';
import { site } from '../../data';
import { useLang } from '../../context/LangContext';
import { homeHref } from '../../utils/localePath';

export default function Brand({ light = false }) {
  const { t } = useLang();
  const { pathname } = useLocation();

  // On any inner page → navigate home. Already on home → just scroll to top.
  // Uses a raw <a href> (not <Link to>) — see homeHref() docs: no <Link to>
  // value can produce the canonical "/fr/" under basename "/fr" without
  // either duplicating the prefix ("/fr/fr/") or dropping the trailing slash.
  const handleClick = (e) => {
    if (pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <a href={homeHref()} onClick={handleClick} className={`brand${light ? ' brand--light' : ''}`}>
      <span className="brand__text">
        <strong>{site.name}</strong>
        <small>{t.tagline}</small>
      </span>
    </a>
  );
}
