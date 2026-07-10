import { Link, useLocation } from 'react-router-dom';
import { site } from '../../data';
import { useLang } from '../../context/LangContext';
import BrandIcon from '../ui/BrandIcon';

export default function Brand({ light = false }) {
  const { t } = useLang();
  const { pathname } = useLocation();

  // On any inner page → navigate home. Already on home → just scroll to top.
  const handleClick = () => {
    if (pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Link to="/" onClick={handleClick} className={`brand${light ? ' brand--light' : ''}`}>
      <BrandIcon size={36} className="brand__mark" />
      <span className="brand__text">
        <strong>{site.name}</strong>
        <small>{t.tagline}</small>
      </span>
    </Link>
  );
}
