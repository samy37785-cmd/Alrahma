import { useState, useEffect, useRef } from 'react';

/* Realistic live-session simulation seeded by hour-of-day */
function getLiveCount() {
  const h = new Date().getHours();
  /* Peak hours: 6-8 AM, 4-9 PM Cairo time (+2). Simulate 15-65 concurrent students. */
  const peaks = [15,10,8,6,5,5,12,28,22,18,15,20,25,22,18,16,20,35,52,60,58,48,38,26];
  const base = peaks[h] ?? 20;
  return base + Math.floor(Math.random() * 7) - 3;
}

function getLessonsThisMonth() {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  /* Approx 12 lessons per day on average → project to end of month */
  const completed = dayOfMonth * 12;
  return completed.toLocaleString();
}

export default function LiveCounter() {
  const [count, setCount] = useState(getLiveCount);
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCount((prev) => {
        const next = getLiveCount();
        if (next !== prev) setPulse(true);
        return next;
      });
    }, 18000); // update every 18 seconds
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 600);
    return () => clearTimeout(t);
  }, [pulse]);

  return (
    <div className="live-counter" aria-live="polite" aria-label="Live student activity">
      <div className="live-counter__dot" aria-hidden="true" />
      <span className={`live-counter__num${pulse ? ' pulse' : ''}`}>{count}</span>
      <span className="live-counter__label">students learning right now</span>
      <span className="live-counter__sep" aria-hidden="true">·</span>
      <span className="live-counter__lessons">{getLessonsThisMonth()} lessons this month</span>
    </div>
  );
}
