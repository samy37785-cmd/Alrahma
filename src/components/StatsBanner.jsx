import { useEffect, useRef, useState } from 'react';

const STATS = [
  { value: 1200, suffix: '+', label: 'Happy Students' },
  { value: 15,   suffix: '+', label: 'Expert Tutors' },
  { value: 5,    suffix: '★', label: 'Average Rating' },
  { value: 24,   suffix: '/7', label: 'Always Available' },
];

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

  return (
    <section className="stats-banner" ref={ref}>
      <div className="container stats-banner__grid">
        {STATS.map((s) => (
          <StatItem key={s.label} {...s} active={active} />
        ))}
      </div>
    </section>
  );
}
