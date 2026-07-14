import { DsBarChart, DsChartEmpty } from '../../ui/DsChart';


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
