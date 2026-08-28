import { Link } from 'react-router-dom';
import Brand from './Brand';
import { homeHref } from '../../utils/localePath';

export default function PageBar({ to, label = '← Back to site' }) {
  // "/" needs a raw <a href={homeHref()}> — react-router's <Link> can't
  // render it correctly under a non-English basename (see
  // utils/localePath.js's homeHref() comment). Any other target (e.g.
  // "/resources/blog") is a plain app-relative path that basename already
  // resolves correctly through a normal <Link>.
  const isHome = to === '/';
  return (
    <header className="quran__bar">
      <div className="container quran__bar-inner">
        <Brand />
        {isHome
          ? <a href={homeHref()} className="btn btn--ghost btn--sm">{label}</a>
          : <Link to={to} className="btn btn--ghost btn--sm">{label}</Link>}
      </div>
    </header>
  );
}
