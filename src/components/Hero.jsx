import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';

export default function Hero() {
  const { t } = useLang();
  const h = t.hero;

  return (
    <section className="hero">
      <div className="container hero__inner">
        {/* ── Left: Text ── */}
        <div className="hero__text">
          <p className="eyebrow">{h.eyebrow}</p>
          <h1>{h.title}</h1>
          <p className="hero__sub">{h.sub}</p>
          <div className="hero__actions">
            <Link to="/enroll" className="btn btn--gold btn--lg">{h.cta1}</Link>
            <a href="#courses" className="btn btn--ghost-white">{h.cta3}</a>
          </div>
          <ul className="hero__badges">
            <li><span className="hero__badge-icon">✓</span>{h.badge1}</li>
            <li><span className="hero__badge-icon">✓</span>{h.badge2}</li>
            <li><span className="hero__badge-icon">✓</span>{h.badge3}</li>
          </ul>
        </div>

        {/* ── Right: Illustration ── */}
        <div className="hero__art" aria-hidden="true">
          <div className="hero__illustration">
            {/* Floating verse card */}
            <div className="hero__verse-card">
              <span className="hero__arabic">ٱقْرَأْ</span>
              <p>{h.verseQuote}</p>
              <small>{h.verseRef}</small>
            </div>

            {/* SVG illustration — Quran/learning scene */}
            <svg viewBox="0 0 420 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="hero__svg">
              {/* Background circle */}
              <circle cx="210" cy="190" r="160" fill="rgba(255,255,255,0.06)" />
              <circle cx="210" cy="190" r="120" fill="rgba(255,255,255,0.04)" />

              {/* Open book */}
              <rect x="80" y="160" width="260" height="170" rx="12" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
              <line x1="210" y1="162" x2="210" y2="328" stroke="rgba(212,175,55,0.6)" strokeWidth="2"/>
              {/* Book lines left */}
              <rect x="100" y="185" width="90" height="5" rx="3" fill="rgba(255,255,255,0.3)"/>
              <rect x="100" y="198" width="75" height="5" rx="3" fill="rgba(255,255,255,0.2)"/>
              <rect x="100" y="211" width="85" height="5" rx="3" fill="rgba(255,255,255,0.25)"/>
              <rect x="100" y="224" width="70" height="5" rx="3" fill="rgba(255,255,255,0.2)"/>
              <rect x="100" y="237" width="80" height="5" rx="3" fill="rgba(255,255,255,0.15)"/>
              <rect x="100" y="250" width="65" height="5" rx="3" fill="rgba(255,255,255,0.2)"/>
              <rect x="100" y="263" width="88" height="5" rx="3" fill="rgba(255,255,255,0.15)"/>
              <rect x="100" y="276" width="72" height="5" rx="3" fill="rgba(255,255,255,0.1)"/>
              {/* Book lines right */}
              <rect x="225" y="185" width="90" height="5" rx="3" fill="rgba(255,255,255,0.3)"/>
              <rect x="225" y="198" width="75" height="5" rx="3" fill="rgba(255,255,255,0.2)"/>
              <rect x="225" y="211" width="85" height="5" rx="3" fill="rgba(255,255,255,0.25)"/>
              <rect x="225" y="224" width="70" height="5" rx="3" fill="rgba(255,255,255,0.2)"/>
              <rect x="225" y="237" width="80" height="5" rx="3" fill="rgba(255,255,255,0.15)"/>
              <rect x="225" y="250" width="65" height="5" rx="3" fill="rgba(255,255,255,0.2)"/>
              <rect x="225" y="263" width="88" height="5" rx="3" fill="rgba(255,255,255,0.15)"/>
              <rect x="225" y="276" width="72" height="5" rx="3" fill="rgba(255,255,255,0.1)"/>

              {/* Crescent moon */}
              <path d="M320 70 A40 40 0 1 1 360 110 A25 25 0 1 0 320 70Z" fill="rgba(212,175,55,0.7)"/>
              {/* Star */}
              <polygon points="295,55 298,65 308,65 300,71 303,81 295,75 287,81 290,71 282,65 292,65" fill="rgba(212,175,55,0.8)"/>

              {/* Laptop/screen */}
              <rect x="120" y="95" width="180" height="110" rx="10" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
              <rect x="128" y="103" width="164" height="94" rx="6" fill="rgba(11,110,79,0.5)"/>
              {/* Screen content — video call */}
              <circle cx="180" cy="140" r="22" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <circle cx="180" cy="133" r="9" fill="rgba(255,255,255,0.4)"/>
              <path d="M162 157 Q180 148 198 157" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none"/>
              <circle cx="240" cy="140" r="22" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <circle cx="240" cy="133" r="9" fill="rgba(212,175,55,0.6)"/>
              <path d="M222 157 Q240 148 258 157" stroke="rgba(212,175,55,0.4)" strokeWidth="2" fill="none"/>
              {/* Laptop base */}
              <rect x="105" y="205" width="210" height="8" rx="4" fill="rgba(255,255,255,0.15)"/>
              <rect x="145" y="213" width="130" height="4" rx="2" fill="rgba(255,255,255,0.1)"/>

              {/* Floating badges */}
              <rect x="30" y="120" width="100" height="38" rx="10" fill="rgba(212,175,55,0.9)"/>
              <text x="80" y="136" textAnchor="middle" fill="#3a2e05" fontSize="9" fontWeight="bold">★ 5.0 Rating</text>
              <text x="80" y="150" textAnchor="middle" fill="#3a2e05" fontSize="8">1,200+ Students</text>

              <rect x="295" y="230" width="100" height="38" rx="10" fill="rgba(255,255,255,0.9)"/>
              <text x="345" y="246" textAnchor="middle" fill="#0b6e4f" fontSize="9" fontWeight="bold">🕌 Al-Azhar</text>
              <text x="345" y="260" textAnchor="middle" fill="#5f6f6a" fontSize="8">Certified Tutors</text>

              {/* Decorative dots */}
              <circle cx="60" cy="280" r="5" fill="rgba(212,175,55,0.4)"/>
              <circle cx="75" cy="295" r="3" fill="rgba(212,175,55,0.3)"/>
              <circle cx="50" cy="300" r="4" fill="rgba(255,255,255,0.2)"/>
              <circle cx="370" cy="100" r="4" fill="rgba(255,255,255,0.2)"/>
              <circle cx="385" cy="115" r="3" fill="rgba(212,175,55,0.3)"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="hero__wave" aria-hidden="true">
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#ffffff"/>
        </svg>
      </div>
    </section>
  );
}
