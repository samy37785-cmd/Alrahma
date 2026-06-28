import { Link } from 'react-router-dom';
import Brand from '../components/layout/Brand';
import '../styles/quran.css';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';

export default function NotFound() {
  const { t } = useLang();
  const nf = t.notFound;
  useSEO({ title: nf.title, noindex: true });
  return (
    <div className="notfound-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">← {nf.goHome}</Link>
        </div>
      </header>

      <main className="container notfound-page__main">
        <div className="notfound-page__inner">
          <p className="notfound-page__code">404</p>
          <h1>{nf.title}</h1>
          <p className="notfound-page__sub">{nf.sub}</p>
          <div className="notfound-page__links">
            <Link to="/" className="btn btn--green">{nf.goHome}</Link>
            <Link to="/blog" className="btn btn--ghost">{nf.readBlog}</Link>
            <Link to="/quran" className="btn btn--ghost">{nf.readQuran}</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
