import { useId, useState } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import { number } from './api';
import { getLocale, translateText } from './i18n';
import StudioSelect from './StudioSelect';
import type { Point, Factor } from './types';

export const COLORS = ['#0f172a', '#64748b', '#c49a3b', '#94a3b8', '#cbd5e1', '#475569'];
type ChartProps = {
  data: Point[];
  lines: { key: string; name: string; color: string }[];
  height?: number;
  area?: boolean;
  kind?: 'index' | 'percent' | 'money' | 'number';
  timeScale?: 'day' | 'second' | 'minute';
  curve?: 'monotone' | 'stepAfter';
  showDots?: boolean;
  rangeControls?: boolean;
};
const DAILY_RANGES = [
  { value: '1d', days: 1 },
  { value: '1M', days: 30 },
  { value: '3M', days: 90 },
  { value: '6M', days: 180 },
  { value: '1Y', days: 365 },
  { value: '3Y', days: 1095 },
] as const;
type DailyRange = typeof DAILY_RANGES[number]['value'];

export function TimeChart({ data, lines, height = 290, area = true, kind = 'index', timeScale = 'day', curve = 'monotone', showDots = false, rangeControls = true }: ChartProps) {
  const id = useId().replace(/:/g, '');
  const [selectedRange, setSelectedRange] = useState<DailyRange | null>(null);
  const firstAvailable = data[0]?.date;
  const lastAvailable = data.at(-1)?.date;
  const availableDays = firstAvailable && lastAvailable && timeScale === 'day'
    ? Math.max(0, (Date.parse(lastAvailable) - Date.parse(firstAvailable)) / 86_400_000)
    : 0;
  const availableRanges = DAILY_RANGES.filter((range) => range.value === '1d' || range.value === '1M' || availableDays >= range.days - 7);
  const activeRange = availableRanges.find((range) => range.value === selectedRange)?.value
    || availableRanges.at(-1)?.value || '1M';
  const rangeDays = DAILY_RANGES.find((range) => range.value === activeRange)?.days || 30;
  const cutoff = lastAvailable ? Date.parse(lastAvailable) - rangeDays * 86_400_000 : 0;
  const chartData = timeScale === 'day' && rangeControls && data.length > 1
    ? activeRange === '1d' ? data.slice(-1) : data.filter((point) => Date.parse(point.date) >= cutoff)
    : data;
  const firstDate = chartData[0]?.date;
  const lastDate = chartData.at(-1)?.date;
  const daySpan = firstDate && lastDate && timeScale === 'day'
    ? (Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000
    : 0;
  const axisTicks = timeScale !== 'day'
    ? chartData.filter((_, index) => index % Math.max(1, Math.ceil(chartData.length / 6)) === 0).map((point) => point.date)
    : chartData.filter((point, index, points) => {
      if (index === 0) return true;
      const current = new Date(point.date + 'T12:00:00');
      const previous = new Date(points[index - 1].date + 'T12:00:00');
      if (daySpan <= 45) return Date.parse(point.date) - Date.parse(points[0].date) >= 7 * 86_400_000
        && Math.floor((Date.parse(point.date) - Date.parse(points[0].date)) / (7 * 86_400_000))
          !== Math.floor((Date.parse(points[index - 1].date) - Date.parse(points[0].date)) / (7 * 86_400_000));
      if (daySpan > 600) return current.getFullYear() * 4 + Math.floor(current.getMonth() / 3)
        !== previous.getFullYear() * 4 + Math.floor(previous.getMonth() / 3);
      return current.getFullYear() * 12 + current.getMonth()
        !== previous.getFullYear() * 12 + previous.getMonth();
    }).map((point) => point.date);
  const values = chartData.flatMap((point) => lines.map((line) => point[line.key]))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const padding = Math.max(maximum - minimum, Math.abs(maximum) * 0.01, kind === 'percent' ? 0.005 : 0.01) * 0.08;
  const yDomain: [number, number] = [minimum - padding, maximum + padding];
  const formatter = (value: number) =>
    kind === 'percent'
      ? number(value * 100, 1) + '%'
      : kind === 'money'
        ? new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
        : number(value, 1);
  return (
    <div className="time-chart-wrap">
      {rangeControls && timeScale === 'day' && data.length > 1 && (
        <div className="chart-range-toolbar">
          <div className="chart-range-dropdown">
            <StudioSelect
              label={getLocale() === 'vi-VN' ? 'Chọn mốc thời gian hiển thị' : 'Choose displayed time range'}
              value={activeRange}
              options={availableRanges.map((range) => ({ value: range.value, label: range.value }))}
              onChange={(value) => setSelectedRange(value as DailyRange)}
            />
          </div>
        </div>
      )}
    <div className="time-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lines[0]?.color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={lines[0]?.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 5" />
          <XAxis
            dataKey="date"
            ticks={axisTicks}
            tickFormatter={(value) => timeScale !== 'day'
              ? new Date(value).toLocaleTimeString(getLocale(), { ...(timeScale === 'minute' ? { month: 'short', day: 'numeric' } as const : {}), hour: '2-digit', minute: '2-digit', ...(timeScale === 'second' ? { second: '2-digit' } as const : {}) })
              : new Date(value + 'T12:00:00').toLocaleDateString(getLocale(), {
                month: 'short',
                ...(daySpan <= 45 ? { day: 'numeric' } : { year: '2-digit' }),
              })
            }
            minTickGap={64}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#64748b' }}
            dy={9}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={formatter}
            tickLine={false}
            axisLine={false}
            width={kind === 'money' ? 82 : 48}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: 0,
              borderRadius: 8,
              color: '#fff',
              fontFamily: 'Geist',
              fontSize: 13,
            }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#fff' }}
            labelFormatter={(value) => timeScale !== 'day'
              ? new Date(String(value)).toLocaleString(getLocale())
              : new Date(String(value) + 'T12:00:00').toLocaleDateString(getLocale())}
            formatter={(value) => formatter(Number(value))}
          />
          {lines.map((line, index) =>
            index === 0 && area ? (
              <Area
                key={line.key}
                dataKey={line.key}
                name={translateText(line.name)}
                type={curve}
                stroke={line.color}
                fill={'url(#' + id + ')'}
                strokeWidth={2.3}
                dot={showDots || chartData.length === 1}
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : (
              <Line
                key={line.key}
                dataKey={line.key}
                name={translateText(line.name)}
                type={curve}
                stroke={line.color}
                strokeWidth={index === 0 ? 2.3 : 1.8}
                dot={showDots || chartData.length === 1}
                isAnimationActive={false}
                connectNulls={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}
export function AllocationChart({ factors }: { factors: Factor[] }) {
  const investedWeight = factors.reduce((total, asset) => total + asset.weight, 0);
  const cashWeight = Math.max(0, 1 - investedWeight);
  const slices = cashWeight > 1e-9
    ? [...factors, { ...factors[0], symbol: 'CASH', weight: cashWeight }]
    : factors;
  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={205}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="weight"
            nameKey="symbol"
            innerRadius={60}
            outerRadius={79}
            paddingAngle={3}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {slices.map((item, i) => (
              <Cell key={item.symbol} fill={item.symbol === 'CASH' ? '#cbd5e1' : COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => number(Number(value) * 100, 1) + '%'} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>
          {number(investedWeight * 100, 0)}%
        </strong>
        <span>stocks</span>
      </div>
    </div>
  );
}
export function FactorChart({
  factors,
  metric,
  benchmark = 'SPY',
  color,
}: {
  factors: Factor[];
  metric: 'beta' | 'momentum';
  benchmark?: string;
  color?: string;
}) {
  const data = factors.map((f) => ({ symbol: f.symbol, value: f[metric] }));
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40, top: 14, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="3 5" />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(v) =>
              number(metric === 'momentum' ? v * 100 : v, 1) + (metric === 'momentum' ? '%' : '')
            }
          />
          <YAxis
            dataKey="symbol"
            type="category"
            width={52}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#475569' }}
          />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            formatter={(v) =>
              number(metric === 'momentum' ? Number(v) * 100 : Number(v), 2) +
              (metric === 'momentum' ? '%' : '')
            }
          />
          <ReferenceLine x={0} stroke="#cbd5e1" />
          <Bar
            dataKey="value"
            name={metric === 'beta' ? `Beta vs ${benchmark}` : 'Momentum 12–1'}
            barSize={19}
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
          >
            {data.map((item, i) => (
              <Cell key={item.symbol} fill={color || COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
