import { useLocation } from 'react-router-dom';
import { site } from '../../data';
import { useLang } from '../../context/LangContext';
import { homeHref } from '../../utils/localePath';
import BrandIcon from '../ui/BrandIcon';

export default function Brand({ light = false }) {
  const { t } = useLang();
  const { pathname } = useLocation();

  // Raw <a href={homeHref()}>, not <Link to="/"> — see utils/localePath.js's
  // homeHref() comment: react-router can't render a duplicate-free,
  // trailing-slash-correct "/fr/" via <Link> under a non-English basename.
  // On any inner page → let the real navigation happen; already on
  // home → prevent the (unnecessary) reload and just scroll to top.
  const handleClick = (e) => {
    if (pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <a href={homeHref()} onClick={handleClick} className={`brand${light ? ' brand--light' : ''}`}>
      <BrandIcon size={36} tile={false} className="brand__mark" />
      <span className="brand__text">
        <strong>{site.name}</strong>
        <small>{t.tagline}</small>
      </span>
    </a>
  );
}
