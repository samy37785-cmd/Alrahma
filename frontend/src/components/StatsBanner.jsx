import { useEffect, useRef, useState } from 'react';
import useScrollReveal from '../hooks/useScrollReveal';
import { useLang } from '../context/LangContext';
import { STATS as STATS_DATA, SHOW_STATS } from '../data/socialProof';

function useCountUp(target, duration = 1600, active = false, decimals = 0) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(decimals ? parseFloat(start.toFixed(decimals)) : Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration, decimals]);
  return count;
}

function StatItem({ value, suffix, label, active, decimals = 0 }) {
  const count = useCountUp(value, 1600, active, decimals);
  return (
    <div className="stats-item">
      <strong className="stats-item__num">{count}{suffix}</strong>
      <span className="stats-item__label">{label}</span>
    </div>
  );
}

export default function StatsBanner() {
  const { t } = useLang();
  const labels = t.stats.labels;
  const countRef  = useRef(null);
  const revealRef = useScrollReveal();
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Fallback for browsers without IntersectionObserver: count up immediately.
    if (typeof IntersectionObserver === 'undefined') { setActive(true); return; }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setActive(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    if (countRef.current) obs.observe(countRef.current);
    return () => obs.disconnect();
  }, []);

  // These figures are placeholder marketing numbers — hide the banner unless
  // they're explicitly enabled (or replaced with real stats in socialProof.js).
  if (!SHOW_STATS) return null;

  // Two independent IntersectionObservers share this one node: countRef drives
  // the count-up (React state), revealRef (useScrollReveal) toggles the
  // .reveal/.visible classes directly via classList — neither interferes with
  // the other, so both refs are attached to the same element.
  return (
    <section
      className="stats-banner"
      ref={(el) => { countRef.current = el; revealRef.current = el; }}
    >
      <div className="container stats-banner__grid">
        {STATS_DATA.map((s, i) => (
          <StatItem key={i} {...s} label={labels[i]} active={active} decimals={s.decimals || 0} />
        ))}
      </div>
    </section>
  );
}
