import { DsBarChart, DsChartEmpty } from '../../ui/DsChart';

/* Weekly activity: last 7 days, aggregate completedAt from ALL enrolled courses */
export function buildWeekBars(allProgressData) {
  const today = new Date();
  const days  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return { date: d.toDateString(), label: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()], count: 0, isToday: i === 6 };
  });

  for (const progressData of (allProgressData || [])) {
    (progressData?.completedAt || []).forEach((ts) => {
      const s = new Date(ts).toDateString();
      const slot = days.find((d) => d.date === s);
      if (slot) slot.count++;
    });
  }
  return days;
}

export default function WeeklyChart({ bars }) {
  const totalLessons = bars.reduce((a, b) => a + b.count, 0);
  const bestDay = bars.reduce((a, b) => b.count > a.count ? b : a, bars[0]);
  const chartData = bars.map((b) => ({
    label: b.label,
    Lessons: b.count,
    isToday: b.isToday,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {totalLessons === 0 ? (
        <DsChartEmpty height={90} message="No activity this week yet" />
      ) : (
        <DsBarChart
          data={chartData}
          bars={[{ key: 'Lessons', label: 'Lessons', color: 'var(--color-primary)' }]}
          height={90}
          xKey="label"
          showGrid={false}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        <span>{totalLessons} lesson{totalLessons !== 1 ? 's' : ''} this week</span>
        {totalLessons > 0 && <span>Best: {bestDay.label}</span>}
      </div>
    </div>
  );
}
