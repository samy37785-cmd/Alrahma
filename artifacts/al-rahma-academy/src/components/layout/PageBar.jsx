import { Link } from 'react-router-dom';
import Brand from './Brand';

export default function PageBar({ to, label = '← Back to site' }) {
  return (
    <header className="quran__bar">
      <div className="container quran__bar-inner">
        <Brand />
        <Link to={to} className="btn btn--ghost btn--sm">{label}</Link>
      </div>
    </header>
  );
}
