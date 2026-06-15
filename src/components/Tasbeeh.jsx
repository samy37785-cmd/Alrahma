import { useState, useEffect, useCallback } from 'react';

const CIRC = 326.73; // 2 * π * 52

const DHIKR_LIST = [
  { id: 'subhan',  ar: 'سُبْحَانَ اللَّهِ',                          en: 'SubhanAllah',         target: 33,  color: '#0b6e4f' },
  { id: 'hamd',    ar: 'الْحَمْدُ لِلَّهِ',                         en: 'Alhamdulillah',        target: 33,  color: '#1a5fa0' },
  { id: 'akbar',   ar: 'اللَّهُ أَكْبَرُ',                          en: 'AllahuAkbar',          target: 34,  color: '#7a3a8a' },
  { id: 'tahlil',  ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ',               en: 'La ilaha illa Allah',  target: 100, color: '#c07020' },
  { id: 'istigh',  ar: 'أَسْتَغْفِرُ اللَّهَ',                     en: 'Astaghfirullah',       target: 100, color: '#a03030' },
  { id: 'hawla',   ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', en: 'La hawla wala quwwa', target: 100, color: '#2a7a50' },
  { id: 'salawat', ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ',         en: 'Salawat',              target: 100, color: '#5a6a9a' },
];

export default function Tasbeeh() {
  const [selectedId, setSelectedId] = useState('subhan');
  const [counts, setCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tsb-counts') || '{}'); } catch { return {}; }
  });
  const [target, setTarget] = useState(33);
  const [flash, setFlash] = useState(false);

  const dhikr = DHIKR_LIST.find((d) => d.id === selectedId);
  const count = counts[selectedId] || 0;
  const displayCount = count === 0 ? 0 : count % target === 0 ? target : count % target;
  const rounds = Math.floor(count / target);
  const progress = count === 0 ? 0 : count % target === 0 ? 1 : (count % target) / target;
  const done = count > 0 && count % target === 0;

  useEffect(() => { setTarget(dhikr?.target || 33); }, [selectedId]);
  useEffect(() => { localStorage.setItem('tsb-counts', JSON.stringify(counts)); }, [counts]);

  const tap = useCallback(() => {
    setCounts((prev) => ({ ...prev, [selectedId]: (prev[selectedId] || 0) + 1 }));
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    if (navigator.vibrate) navigator.vibrate(20);
  }, [selectedId]);

  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tap]);

  const totalToday = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="tsb">

      {/* ── Dhikr pills ─────────────────────────────────────── */}
      <div className="tsb__pills">
        {DHIKR_LIST.map((d) => (
          <button
            key={d.id}
            className={`tsb__pill${selectedId === d.id ? ' active' : ''}`}
            style={selectedId === d.id ? { background: d.color, borderColor: d.color } : {}}
            onClick={() => setSelectedId(d.id)}
          >
            <span className="tsb__pill-ar" dir="rtl">{d.ar.split(' ').slice(0, 2).join(' ')}</span>
            <span className="tsb__pill-n">×{d.target}</span>
          </button>
        ))}
      </div>

      {/* ── Ring ────────────────────────────────────────────── */}
      <div className="tsb__stage">
        <div className={`tsb__ring-wrap${flash ? ' tsb__ring-wrap--flash' : ''}${done ? ' tsb__ring-wrap--done' : ''}`}>
          <svg className="tsb__svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" className="tsb__track" />
            <circle
              cx="60" cy="60" r="52"
              className="tsb__arc"
              style={{ stroke: dhikr?.color, strokeDashoffset: CIRC * (1 - progress) }}
            />
          </svg>
          <div className="tsb__inner">
            <span className="tsb__num">{displayCount}</span>
            <span className="tsb__den">/ {target}</span>
            {rounds > 0 && <span className="tsb__rounds">{rounds}× مكتمل</span>}
          </div>
        </div>

        <p className="tsb__name-ar" dir="rtl" style={{ color: dhikr?.color }}>{dhikr?.ar}</p>
        <p className="tsb__name-en">{dhikr?.en}</p>

        {done && (
          <div className="tsb__badge" style={{ background: dhikr?.color }}>
            ✓ {rounds} دورة مكتملة
          </div>
        )}
      </div>

      {/* ── Tap button ──────────────────────────────────────── */}
      <button
        className={`tsb__tap${flash ? ' tsb__tap--flash' : ''}`}
        style={{ background: dhikr?.color }}
        onClick={tap}
        aria-label="اضغط للذكر"
      >
        <span className="tsb__tap-ar">اضغط</span>
        <span className="tsb__tap-hint">أو Space / Enter</span>
      </button>

      {/* ── Target selector ─────────────────────────────────── */}
      <div className="tsb__target-row">
        <span className="tsb__target-lbl">الهدف:</span>
        {[33, 34, 99, 100, 300, 1000].map((n) => (
          <button
            key={n}
            className={`tsb__tgt${target === n ? ' active' : ''}`}
            style={target === n ? { background: dhikr?.color, borderColor: dhikr?.color } : {}}
            onClick={() => setTarget(n)}
          >{n}</button>
        ))}
      </div>

      {/* ── Reset ───────────────────────────────────────────── */}
      <div className="tsb__resets">
        <button className="tsb__rst" onClick={() => setCounts((p) => ({ ...p, [selectedId]: 0 }))}>
          ↺ إعادة هذا
        </button>
        <button className="tsb__rst tsb__rst--all" onClick={() => setCounts({})}>
          ↺ مسح الكل
        </button>
      </div>

      {/* ── Session stats ───────────────────────────────────── */}
      {totalToday > 0 && (
        <div className="tsb__stats">
          <p className="tsb__stats-title">إجمالي الجلسة: <strong>{totalToday.toLocaleString()}</strong></p>
          <div className="tsb__stats-row">
            {DHIKR_LIST.filter((d) => counts[d.id] > 0).map((d) => (
              <div key={d.id} className="tsb__stat-item" style={{ borderColor: d.color }}>
                <span className="tsb__stat-n" style={{ color: d.color }}>{counts[d.id]}</span>
                <span className="tsb__stat-l">{d.en}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
