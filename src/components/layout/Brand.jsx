import { site } from '../../data';
import { useLang } from '../../context/LangContext';

export default function Brand({ light = false }) {
  const { t } = useLang();
  return (
    <a href="#top" className={`brand${light ? ' brand--light' : ''}`}>
      <span className="brand__mark">۩</span>
      <span className="brand__text">
        <strong>{site.name}</strong>
        <small>{t.tagline}</small>
      </span>
    </a>
  );
}
