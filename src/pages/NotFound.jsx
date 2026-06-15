import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import useSEO from '../hooks/useSEO';

export default function NotFound() {
  useSEO({ title: 'Page Not Found' });
  return (
    <div className="notfound-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">← Home</Link>
        </div>
      </header>

      <main className="container notfound-page__main">
        <div className="notfound-page__inner">
          <p className="notfound-page__code">404</p>
          <h1>Page Not Found</h1>
          <p className="notfound-page__sub">
            The page you are looking for does not exist or has been moved.
          </p>
          <div className="notfound-page__links">
            <Link to="/" className="btn btn--green">Go to Home</Link>
            <Link to="/blog" className="btn btn--ghost">Read our Blog</Link>
            <Link to="/quran" className="btn btn--ghost">Read Quran</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
