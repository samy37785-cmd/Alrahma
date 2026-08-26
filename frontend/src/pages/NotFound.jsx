import { Link } from 'react-router-dom';
import { homeHref } from '../utils/localePath';
import PageBar from '../components/layout/PageBar';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
// home links use raw <a href> — see homeHref() docs (Link would duplicate prefix)

export default function NotFound() {
  const { t } = useLang();
  const nf = t.notFound;
  useSEO({ title: nf.title, noindex: true });
  return (
    <div className="notfound-page">
      <PageBar to={homeHref()} label={`← ${nf.goHome}`} />

      <main className="container notfound-page__main">
        <div className="notfound-page__inner">
          <p className="notfound-page__code">404</p>
          <h1>{nf.title}</h1>
          <p className="notfound-page__sub">{nf.sub}</p>
          <div className="notfound-page__links">
            <a href={homeHref()} className="btn btn--green">{nf.goHome}</a>
            <Link to="/resources/blog" className="btn btn--ghost">{nf.readBlog}</Link>
            <Link to="/tools/quran-reader" className="btn btn--ghost">{nf.readQuran}</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
