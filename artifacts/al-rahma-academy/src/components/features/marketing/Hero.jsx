import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../../context/LangContext';
import QuranAudioPlayer from '../../ui/QuranAudioPlayer';
import BrandLockup from '../../ui/BrandLockup';

const DEMO_VIDEO_ID = import.meta.env.VITE_DEMO_VIDEO_ID || 'dQw4w9WgXcQ';

// The badge1/2/3 translation strings already contain a leading "✓ " (used
// elsewhere as plain inline text) — this list renders its own styled
// checkmark badge, so the string's own checkmark must be stripped to avoid
// showing two of them.
const stripLeadingCheck = (str) => (str || '').replace(/^✓\s*/, '');

// Trust/marketing remediation (see docs/trust-marketing-remediation.md):
// this file used to render two fabricated blocks that are now removed —
//   1. A hardcoded stats bar (['9,000+ lessons', '4.9★ rating',
//      '40+ countries', '32 tutors']) with no real source in this repo,
//      the exact same unsupported figures already removed from
//      StatsBanner.jsx/socialProof.js.
//   2. A "live activity ticker" (LIVE_ACTIVITY) that cycled through eight
//      fabricated named people ("Ahmad from Frankfurt just booked a free
//      trial") on a 3.8s setInterval — a fake real-time social-proof
//      signal, the same category of problem as the deleted LiveCounter.
// A hardcoded "4.9 / 5" rating pill paired with an unsupported "1,200+
// students" figure was removed for the same reason (§3). The Al-Azhar
// certification pill and verse card are untouched — no code in this repo
// marks the Al-Azhar claim itself as placeholder/fabricated (see the
// Unknown Evidence Register).

export default function Hero({ onTrialClick }) {
  const { t } = useLang();
  const h = t.hero;
  const [videoOpen, setVideoOpen] = useState(false);

  const closeVideo = useCallback((e) => {
    if (e.target === e.currentTarget || e.key === 'Escape') setVideoOpen(false);
  }, []);

  useEffect(() => {
    if (!videoOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setVideoOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [videoOpen]);

  return (
    <section className="hero">
      <div className="hero__orb hero__orb--1" aria-hidden="true" />
      <div className="hero__orb hero__orb--2" aria-hidden="true" />

      <div className="container hero__inner">

        {/* ── Left: Text ── */}
        <div className="hero__text">

          {/* Live sessions badge */}
          <div className="hero__live-badge" aria-label="Live sessions available now">
            <span className="live-dot" aria-hidden="true" />
            {h.liveSessions}
          </div>

          <p className="hero__eyebrow">
            <span className="hero__eyebrow-dot" />
            {h.eyebrow}
          </p>

          <h1>
            {h.title.split(' ').map((word, i) =>
              ['quran','corano','coran','القرآن','corán','koran'].includes(word.toLowerCase())
                ? <span key={i} className="hero__highlight">{word} </span>
                : <span key={i}>{word} </span>
            )}
          </h1>

          <p className="hero__sub">{h.sub}</p>

          <div className="hero__actions">
            <button
              type="button"
              className="btn btn--gold btn--lg"
              onClick={onTrialClick}
            >
              {h.cta1}
            </button>
            <button
              type="button"
              className="btn btn--ghost-white hero__watch-btn"
              onClick={() => setVideoOpen(true)}
              aria-haspopup="dialog"
            >
              <span className="hero__play-icon" aria-hidden="true">▶</span>
              {h.watchDemo}
            </button>
          </div>

          {/* Micro-copy: kill conversion objections instantly */}
          <p className="hero__microcopy">
            <span>✓ {h.microcopy[0]}</span>
            <span className="hero__microcopy-dot" aria-hidden="true">·</span>
            <span>✓ {h.microcopy[1]}</span>
            <span className="hero__microcopy-dot" aria-hidden="true">·</span>
            <span>✓ {h.microcopy[2]}</span>
          </p>

          <ul className="hero__badges">
            <li><span className="hero__badge-check">✓</span>{stripLeadingCheck(h.badge1)}</li>
            <li><span className="hero__badge-check">✓</span>{stripLeadingCheck(h.badge2)}</li>
            <li><span className="hero__badge-check">✓</span>{stripLeadingCheck(h.badge3)}</li>
          </ul>

        </div>

        {/* ── Right: Brand lockup ── */}
        <div className="hero__visual hero__visual--medallion">

          <BrandLockup orientation="vertical" className="hero__lockup" />

          {/* Floating pill — Al-Azhar certification */}
          <div className="hero__pill hero__pill--bottom">
            <span className="hero__pill-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
            </span>
            <div>
              <strong>Al-Azhar</strong>
              <span>{h.certifiedTutors}</span>
            </div>
          </div>

          {/* Quranic verse card */}
          <div className="hero__verse">
            <p>{h.verseQuote}</p>
            <small>{h.verseRef}</small>
          </div>

        </div>
      </div>

      {/* Scroll indicator */}
      <a href="#courses" className="hero__scroll-cue" aria-label="Scroll down to explore courses">
        <span>{h.scroll}</span>
        <div className="hero__scroll-icon" />
      </a>

      {/* Quran audio ambient player */}
      <QuranAudioPlayer />

      {/* Bottom wave transition */}
      <div className="hero__wave" aria-hidden="true">
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#ffffff"/>
        </svg>
      </div>

      {/* ── Video demo modal ── */}
      {videoOpen && (
        <div
          className="hero__video-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Live lesson demo"
          onClick={closeVideo}
        >
          <div className="hero__video-box">
            <button
              type="button"
              className="hero__video-close"
              onClick={() => setVideoOpen(false)}
              aria-label="Close video"
            >
              ✕
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${DEMO_VIDEO_ID}?autoplay=1&rel=0`}
              title="Live lesson demo"
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="hero__video-iframe"
            />
          </div>
        </div>
      )}
    </section>
  );
}
