import { useEffect, useRef, useState, useCallback } from 'react';

const MILESTONES = [25, 50, 75, 100];

const MILESTONE_META = {
  25:  { emoji: '🌱', label: 'Great start!',       arabic: 'بداية موفقة',          color: '#0b6e4f', linkedin: 'I completed 25% of my Quran course at Al-Rahma Academy!' },
  50:  { emoji: '⚡', label: 'Halfway there!',     arabic: 'نصف الطريق',            color: '#d97706', linkedin: 'I\'m halfway through my Quran course at Al-Rahma Academy!' },
  75:  { emoji: '🔥', label: 'Almost there!',      arabic: 'قاب قوسين أو أدنى',    color: '#dc2626', linkedin: '75% done with my Quran course at Al-Rahma Academy!' },
  100: { emoji: '🎓', label: 'Course complete!',   arabic: 'أتممت المنهج',          color: '#7c3aed', linkedin: 'I just completed my Quran course at Al-Rahma Academy! 🎓' },
};

const STORAGE_KEY = 'alrahma_celebrated_milestones';

function getCelebrated() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function markCelebrated(courseId, pct) {
  const c = getCelebrated();
  c[`${courseId}:${pct}`] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}
function wasCelebrated(courseId, pct) {
  return Boolean(getCelebrated()[`${courseId}:${pct}`]);
}

export default function MilestoneCelebration({ courseId, courseTitle, pct }) {
  const [visible, setVisible] = useState(false);
  const [milestone, setMilestone] = useState(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!courseId || pct == null) return;
    const hit = [...MILESTONES].reverse().find(
      (m) => pct >= m && !wasCelebrated(courseId, m),
    );
    if (!hit) return;
    markCelebrated(courseId, hit);
    setMilestone(hit);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 10000);
    return () => clearTimeout(timerRef.current);
  }, [courseId, pct]);

  const dismiss = useCallback(() => setVisible(false), []);

  const shareLinkedIn = useCallback(() => {
    if (!milestone) return;
    const meta = MILESTONE_META[milestone];
    const text = courseTitle ? `${meta.linkedin} — "${courseTitle}"` : meta.linkedin;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://al-rahma.academy')}&summary=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'width=600,height=500');
  }, [milestone, courseTitle]);

  const shareWhatsApp = useCallback(() => {
    if (!milestone) return;
    const meta = MILESTONE_META[milestone];
    const text = courseTitle
      ? `${meta.linkedin} — "${courseTitle}" 🕌 Al-Rahma Academy`
      : `${meta.linkedin} 🕌 Al-Rahma Academy`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }, [milestone, courseTitle]);

  const copyAchievement = useCallback(() => {
    if (!milestone) return;
    const meta = MILESTONE_META[milestone];
    const text = courseTitle
      ? `${meta.linkedin} — "${courseTitle}" 🕌 al-rahma.academy`
      : `${meta.linkedin} 🕌 al-rahma.academy`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [milestone, courseTitle]);

  if (!visible || !milestone) return null;

  const meta = MILESTONE_META[milestone];

  return (
    <div
      className="milestone-toast"
      role="status"
      aria-live="polite"
      style={{ '--ms-color': meta.color }}
    >
      <div className="milestone-toast__confetti" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="milestone-toast__dot" style={{ '--i': i }} />
        ))}
      </div>

      <div className="milestone-toast__emoji" aria-hidden="true">{meta.emoji}</div>

      <div className="milestone-toast__body">
        <div className="milestone-toast__pct">{milestone}% Complete</div>
        <div className="milestone-toast__label">{meta.label}</div>
        <div className="milestone-toast__arabic">{meta.arabic}</div>
        {courseTitle && (
          <div className="milestone-toast__course">{courseTitle}</div>
        )}

        {/* Share row */}
        <div className="milestone-toast__share">
          <button
            className="milestone-toast__share-btn milestone-toast__share-btn--li"
            onClick={shareLinkedIn}
            title="Share on LinkedIn"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </button>
          <button
            className="milestone-toast__share-btn milestone-toast__share-btn--wa"
            onClick={shareWhatsApp}
            title="Share on WhatsApp"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            WhatsApp
          </button>
          <button
            className="milestone-toast__share-btn milestone-toast__share-btn--copy"
            onClick={copyAchievement}
            title="Copy achievement text"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      <button
        className="milestone-toast__close"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
