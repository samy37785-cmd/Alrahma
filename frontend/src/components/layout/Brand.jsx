import { Link, useLocation } from 'react-router-dom';
import { site } from '../../data';
import { useLang } from '../../context/LangContext';

export default function Brand({ light = false }) {
  const { t } = useLang();
  const { pathname } = useLocation();

  // On any inner page → navigate home. Already on home → just scroll to top.
  const handleClick = () => {
    if (pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Link to="/" onClick={handleClick} className={`brand${light ? ' brand--light' : ''}`}>
      <span className="brand__mark" aria-hidden="true">۩</span>
      <span className="brand__text">
        <strong>{site.name}</strong>
        <small>{t.tagline}</small>
      </span>
    </Link>
  );
}
