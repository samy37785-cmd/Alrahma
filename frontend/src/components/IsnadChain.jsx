import Reveal from './ui/Reveal';

const CHAIN = [
  {
    icon: '🌟',
    name: 'The Prophet ﷺ',
    detail: 'Received revelation in the Cave of Hira',
    highlight: true,
  },
  {
    icon: '📿',
    name: 'The Companions',
    detail: 'Memorised and transmitted word-for-word',
  },
  {
    icon: '🕌',
    name: 'Al-Azhar University',
    detail: 'Over 1,000 years of unbroken scholarship',
  },
  {
    icon: '🎓',
    name: 'Our Tutors',
    detail: 'Ijazah-certified with verified sanad',
  },
  {
    icon: '⭐',
    name: 'Your Child',
    detail: 'Joins a 1,400-year chain of Quran learners',
    highlight: true,
  },
];

export default function IsnadChain() {
  return (
    <section className="isnad" aria-label="The Isnad — unbroken chain of Quran transmission">
      <div className="isnad__bg" aria-hidden="true" />
      <div className="container">
        <Reveal className="section-head isnad__head">
          <p className="eyebrow">Our Legacy</p>
          <h2>
            Every lesson is connected to<br />
            <span className="isnad__gold">1,400 years of unbroken transmission</span>
          </h2>
          <p className="section-sub">
            When your child learns with Al-Rahma, they join a living chain — the same Quran
            recited to the Prophet ﷺ, passed down generation by generation to your home.
          </p>
        </Reveal>

        <Reveal className="isnad__chain" aria-label="Chain of Quran transmission">
          {CHAIN.map((node, i) => (
            <div key={node.name} className="isnad__node-wrap">
              <div className={`isnad__node${node.highlight ? ' isnad__node--hl' : ''}`}>
                <span className="isnad__node-icon" aria-hidden="true">{node.icon}</span>
                <strong className="isnad__node-name">{node.name}</strong>
                <span className="isnad__node-detail">{node.detail}</span>
              </div>
              {i < CHAIN.length - 1 && (
                <div className="isnad__arrow" aria-hidden="true">
                  <div className="isnad__arrow-line" />
                  <div className="isnad__arrow-head" />
                </div>
              )}
            </div>
          ))}
        </Reveal>

        <Reveal className="isnad__manifesto">
          <blockquote className="isnad__quote">
            &quot;The best of you are those who learn the Quran and teach it.&quot;
          </blockquote>
          <cite className="isnad__cite">— Sahih Al-Bukhari</cite>
          <div className="isnad__cta-row">
            <a href="/enroll" className="btn btn--gold">
              Give your child this gift →
            </a>
            <a href="/teachers" className="btn btn--ghost">
              Meet our Ijazah holders
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
