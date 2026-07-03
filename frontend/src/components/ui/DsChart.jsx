/**
 * DsChart — Recharts wrappers that consume the Al-Rahma design tokens.
 * All charts are responsive, accessible, animated, and dark-mode aware.
 *
 * Exports:
 *   DsBarChart      — vertical bars (revenue, activity)
 *   DsAreaChart     — smooth area lines (growth trend)
 *   DsLineChart     — multi-series line comparison
 *   DsPieChart      — donut / pie distribution
 *   DsChartEmpty    — empty state placeholder
 *   DsChartLoading  — skeleton loading state
 */

import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from 'recharts';

import { CHART_COLORS } from './chartColors.js';
export { CHART_COLORS } from './chartColors.js';

const SERIES_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.blue,
  CHART_COLORS.accent,
  CHART_COLORS.purple,
  CHART_COLORS.teal,
  CHART_COLORS.orange,
  CHART_COLORS.pink,
  CHART_COLORS.danger,
];

/* ── Shared tooltip ─────────────────────────────────────────────── */
function DsTooltip({ active, payload, label, formatter, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: 'var(--shadow-md)',
        fontSize: '0.82rem',
        minWidth: 110,
      }}
    >
      {label && (
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{entry.name}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatter ? formatter(entry.value) : entry.value}{unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Shared legend ──────────────────────────────────────────────── */
function DsLegend({ payload }) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: entry.color, flexShrink: 0 }} />
          {entry.value}
        </div>
      ))}
    </div>
  );
}

/* ── Grid & axis shared props ───────────────────────────────────── */
const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'var(--border-subtle)',
  vertical: false,
};

const XAXIS_PROPS = {
  tick: { fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' },
  axisLine: false,
  tickLine: false,
};

const YAXIS_PROPS = {
  tick: { fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' },
  axisLine: false,
  tickLine: false,
  width: 36,
};

/* ════════════════════════════════════════════════════════════════
   DsBarChart
   ════════════════════════════════════════════════════════════════ */
export function DsBarChart({
  data = [],
  bars = [{ key: 'value', label: 'Value', color: CHART_COLORS.primary }],
  height = 200,
  xKey = 'label',
  unit = '',
  formatter,
  showGrid = true,
  showLegend = false,
  radius = 4,
  maxBarSize = 40,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
        {showGrid && <CartesianGrid {...GRID_PROPS} />}
        <XAxis dataKey={xKey} {...XAXIS_PROPS} />
        <YAxis {...YAXIS_PROPS} tickFormatter={formatter} />
        <Tooltip
          content={<DsTooltip formatter={formatter} unit={unit} />}
          cursor={{ fill: 'var(--bg-surface-hover)', radius: 6 }}
        />
        {showLegend && <Legend content={<DsLegend />} />}
        {bars.map((bar, i) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label}
            fill={bar.color || SERIES_PALETTE[i % SERIES_PALETTE.length]}
            radius={[radius, radius, 0, 0]}
            maxBarSize={maxBarSize}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════════════════════════════
   DsAreaChart
   ════════════════════════════════════════════════════════════════ */
export function DsAreaChart({
  data = [],
  areas = [{ key: 'value', label: 'Value', color: CHART_COLORS.primary }],
  height = 200,
  xKey = 'label',
  unit = '',
  formatter,
  showGrid = true,
  showLegend = false,
  strokeWidth = 2,
  fillOpacity = 0.18,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          {areas.map((area, i) => {
            const color = area.color || SERIES_PALETTE[i % SERIES_PALETTE.length];
            return (
              <linearGradient key={area.key} id={`grad-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"   stopColor={color} stopOpacity={fillOpacity * 3} />
                <stop offset="95%"  stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        {showGrid && <CartesianGrid {...GRID_PROPS} />}
        <XAxis dataKey={xKey} {...XAXIS_PROPS} />
        <YAxis {...YAXIS_PROPS} tickFormatter={formatter} />
        <Tooltip
          content={<DsTooltip formatter={formatter} unit={unit} />}
          cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
        />
        {showLegend && <Legend content={<DsLegend />} />}
        {areas.map((area, i) => {
          const color = area.color || SERIES_PALETTE[i % SERIES_PALETTE.length];
          return (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.label}
              stroke={color}
              strokeWidth={strokeWidth}
              fill={`url(#grad-${area.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={700}
              animationEasing="ease-out"
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════════════════════════════
   DsLineChart
   ════════════════════════════════════════════════════════════════ */
export function DsLineChart({
  data = [],
  lines = [{ key: 'value', label: 'Value', color: CHART_COLORS.primary }],
  height = 200,
  xKey = 'label',
  unit = '',
  formatter,
  showGrid = true,
  showLegend = false,
  strokeWidth = 2,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {showGrid && <CartesianGrid {...GRID_PROPS} />}
        <XAxis dataKey={xKey} {...XAXIS_PROPS} />
        <YAxis {...YAXIS_PROPS} tickFormatter={formatter} />
        <Tooltip
          content={<DsTooltip formatter={formatter} unit={unit} />}
          cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
        />
        {showLegend && <Legend content={<DsLegend />} />}
        {lines.map((line, i) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label}
            stroke={line.color || SERIES_PALETTE[i % SERIES_PALETTE.length]}
            strokeWidth={strokeWidth}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            animationDuration={700}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════════════════════════════
   DsPieChart  (donut)
   ════════════════════════════════════════════════════════════════ */
export function DsPieChart({
  data = [],
  height = 220,
  innerRadius = '55%',
  outerRadius = '80%',
  colors = SERIES_PALETTE,
  showLegend = true,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={3}
          dataKey="value"
          animationBegin={0}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const { name, value, payload: pl } = payload[0];
            const total = data.reduce((s, d) => s + d.value, 0);
            return (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{pl.name || name}</div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{value}</strong>
                  {total > 0 && <span> · {Math.round((value / total) * 100)}%</span>}
                </div>
              </div>
            );
          }}
        />
        {showLegend && <Legend content={<DsLegend />} />}
        {/* Center label overlay handled via foreignObject isn't reliable;
            use absolute positioned div in the parent instead. */}
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════════════════════════════
   DsChartEmpty — empty state when data is []
   ════════════════════════════════════════════════════════════════ */
export function DsChartEmpty({ height = 200, message = 'No data yet' }) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: 'var(--text-secondary)',
        borderRadius: 10,
        border: '1px dashed var(--border-default)',
        background: 'var(--bg-page)',
      }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.4 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <span style={{ fontSize: '0.82rem' }}>{message}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   DsChartLoading — shimmer skeleton
   ════════════════════════════════════════════════════════════════ */
export function DsChartLoading({ height = 200 }) {
  return (
    <div className="ds-skel" style={{ height, borderRadius: 10 }} role="status" aria-label="Loading chart" />
  );
}
