import { Link } from 'react-router-dom';
import Reveal from '../../ui/Reveal';
import { useLang } from '../../../context/LangContext';
import { ISNAD_CHAIN_NODES } from '../../../data/home/isnadChain';
import { ISNAD_CHAIN_TEXT } from '../../../i18n/home/isnadChain';

export default function IsnadChain() {
  const { lang } = useLang();
  const t = ISNAD_CHAIN_TEXT[lang] || ISNAD_CHAIN_TEXT.en;

  return (
    <section className="isnad" aria-label="The Isnad — unbroken chain of Quran transmission">
      <div className="isnad__bg" aria-hidden="true" />
      <div className="container">
        <Reveal className="section-head isnad__head">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2>
            {t.headingLine1}<br />
            <span className="isnad__gold">{t.headingLine2}</span>
          </h2>
          <p className="section-sub">{t.subCopy}</p>
        </Reveal>

        <Reveal className="isnad__chain" aria-label="Chain of Quran transmission">
          {ISNAD_CHAIN_NODES.map((node, i) => {
            const nodeText = t.nodes[node.id];
            return (
              <div key={node.id} className="isnad__node-wrap">
                <div className={`isnad__node${node.highlight ? ' isnad__node--hl' : ''}`}>
                  <span className="isnad__node-icon" aria-hidden="true">{node.icon}</span>
                  <strong className="isnad__node-name">{nodeText.name}</strong>
                  <span className="isnad__node-detail">{nodeText.detail}</span>
                </div>
                {i < ISNAD_CHAIN_NODES.length - 1 && (
                  <div className="isnad__arrow" aria-hidden="true">
                    <div className="isnad__arrow-line" />
                    <div className="isnad__arrow-head" />
                  </div>
                )}
              </div>
            );
          })}
        </Reveal>

        <Reveal className="isnad__manifesto">
          <blockquote className="isnad__quote">{t.quote}</blockquote>
          <cite className="isnad__cite">{t.citation}</cite>
          <div className="isnad__cta-row">
            <Link to="/enroll" className="btn btn--gold">
              {t.ctaGift}
            </Link>
            <Link to="/academy/teachers" className="btn btn--ghost">
              {t.ctaMeet}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
