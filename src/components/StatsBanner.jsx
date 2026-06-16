import { useEffect, useRef, useState } from 'react';
import { useLang } from '../context/LangContext';
import { STATS as STATS_DATA, SHOW_PLACEHOLDER_CONTENT } from '../data/socialProof';

function useCountUp(target, duration = 1600, active = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration]);
  return count;
}

function StatItem({ value, suffix, label, active }) {
  const count = useCountUp(value, 1600, active);
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
  const ref  = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setActive(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  // These figures are placeholder marketing numbers — hide the banner unless
  // they're explicitly enabled (or replaced with real stats in socialProof.js).
  if (!SHOW_PLACEHOLDER_CONTENT) return null;

  return (
    <section className="stats-banner" ref={ref}>
      <div className="container stats-banner__grid">
        {STATS_DATA.map((s, i) => (
          <StatItem key={i} {...s} label={labels[i]} active={active} />
        ))}
      </div>
    </section>
  );
}
