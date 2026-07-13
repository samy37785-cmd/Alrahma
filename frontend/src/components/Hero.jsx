import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../context/LangContext';
import QuranAudioPlayer from './ui/QuranAudioPlayer';
import BrandLockup from './ui/BrandLockup';

const DEMO_VIDEO_ID = import.meta.env.VITE_DEMO_VIDEO_ID || 'dQw4w9WgXcQ';

// The badge1/2/3 translation strings already contain a leading "✓ " (used
// elsewhere as plain inline text) — this list renders its own styled
// checkmark badge, so the string's own checkmark must be stripped to avoid
// showing two of them.
const stripLeadingCheck = (str) => (str || '').replace(/^✓\s*/, '');

/* Inline SVG icons for the stats bar — matches the site-wide Lucide-style
   icon language used everywhere else on the homepage. */
const STAT_ICONS = [
  <svg key="book" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z" />
    <path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8Z" />
  </svg>,
  <svg key="star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7-5.4-4.7 7.1-.6L12 2z" />
  </svg>,
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>,
  <svg key="grad" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10 12 5 2 10l10 5 10-5Z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>,
];

const LIVE_ACTIVITY = [
  { name: 'Ahmad', location: 'Frankfurt', action: 'just booked a free trial' },
  { name: 'Fatima', location: 'Rome', action: 'enrolled in Tajweed' },
  { name: 'Yusuf', location: 'Amsterdam', action: 'started Hifz programme' },
  { name: 'Mariam', location: 'London', action: 'completed her first lesson' },
  { name: 'Hassan', location: 'Paris', action: 'just booked a free trial' },
  { name: 'Sara', location: 'Madrid', action: 'enrolled in Arabic course' },
  { name: 'Tariq', location: 'Berlin', action: 'started Quran Reading' },
  { name: 'Nour', location: 'Lyon', action: 'just booked a free trial' },
];

export default function Hero({ onTrialClick }) {
  const { t } = useLang();
  const h = t.hero;
  const [activityIdx, setActivityIdx] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setActivityIdx((i) => (i + 1) % LIVE_ACTIVITY.length), 3800);
    return () => clearInterval(id);
  }, []);

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

          {/* Stats bar */}
          <div className="hero__stats-bar" aria-label="Al-Rahma Academy statistics">
            {['9,000+', '4.9★', '40+', '32'].map((value, i) => (
              <div key={value} className="hero__stat">
                <span className="hero__stat-icon" aria-hidden="true">{STAT_ICONS[i]}</span>
                <span className="hero__stat-text">
                  <strong>{value}</strong>
                  <span>{h.statsLabels[i]}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Live activity ticker — social proof that updates every ~4 seconds */}
          <div className="hero__activity" key={activityIdx} aria-live="polite" aria-atomic="true">
            <span className="hero__activity-dot" aria-hidden="true" />
            <span className="hero__activity-text">
              <strong>{LIVE_ACTIVITY[activityIdx].name}</strong>
              {' '}{h.activityFrom}{' '}{LIVE_ACTIVITY[activityIdx].location}{' '}
              {h.activityActions[activityIdx]}
            </span>
          </div>
        </div>

        {/* ── Right: Brand lockup ── */}
        <div className="hero__visual hero__visual--medallion">

          <BrandLockup orientation="vertical" className="hero__lockup" />

          {/* Floating pill — rating */}
          <div className="hero__pill hero__pill--top">
            <span className="hero__pill-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7-5.4-4.7 7.1-.6L12 2z"/>
              </svg>
            </span>
            <div>
              <strong>4.9 / 5</strong>
              <span>{h.studentsCount}</span>
            </div>
          </div>

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
