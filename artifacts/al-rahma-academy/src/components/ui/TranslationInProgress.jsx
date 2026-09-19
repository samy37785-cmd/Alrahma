import PageBar from '../layout/PageBar';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';
import { getExperienceText } from '../../i18n/experience';
import { pathFor } from '../../utils/localePath';

// Rendered instead of a page's real content when the current (route, lang)
// pair is marked 'draft' in src/data/translationStatus.js -- e.g. someone
// opens /de/courses/ijazah directly and the German version isn't published
// yet. Mirrors NotFound.jsx's structure: a raw <a href> for the English
// link, not <Link>, since a <Link> cannot cross the basename/language
// boundary (see localePath.js's homeHref() comment for why).
export default function TranslationInProgress({ route }) {
  const { lang } = useLang();
  const tip = getExperienceText(lang).translationInProgress;
  useSEO({ title: tip.title, noindex: true });

  return (
    <div className="notfound-page">
      <PageBar to="/" label={`← ${tip.home}`} />

      <main className="container notfound-page__main">
        <div className="notfound-page__inner">
          <h1>{tip.title}</h1>
          <p className="notfound-page__sub">{tip.message}</p>
          <div className="notfound-page__links">
            <a href={pathFor(route, 'en')} className="btn btn--green">{tip.viewEnglish}</a>
          </div>
        </div>
      </main>
    </div>
  );
}
