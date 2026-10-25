import { useId } from 'react';
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
import type { Point, Factor } from './types';

export const COLORS = ['#245947', '#99B972', '#C8D9B3', '#789F9C', '#d9cba2', '#99a5c1'];
type ChartProps = {
  data: Point[];
  lines: { key: string; name: string; color: string }[];
  height?: number;
  area?: boolean;
  kind?: 'index' | 'percent' | 'money' | 'number';
};
export function TimeChart({ data, lines, height = 290, area = true, kind = 'index' }: ChartProps) {
  const id = useId().replace(/:/g, '');
  const formatter = (value: number) =>
    kind === 'percent'
      ? number(value * 100, 1) + '%'
      : kind === 'money'
        ? '$' + number(value, 0)
        : number(value, 1);
  return (
    <div className="time-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lines[0]?.color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={lines[0]?.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e7ebe3" strokeDasharray="3 5" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) =>
              new Date(value + 'T12:00:00').toLocaleDateString('vi-VN', {
                month: 'short',
                year: '2-digit',
              })
            }
            minTickGap={64}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#879087' }}
            dy={9}
          />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={formatter}
            tickLine={false}
            axisLine={false}
            width={kind === 'money' ? 68 : 48}
            tick={{ fontSize: 11, fill: '#879087' }}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{
              background: '#173c32',
              border: 0,
              borderRadius: 8,
              color: '#fff',
              fontFamily: 'Source Sans 3',
              fontSize: 13,
            }}
            labelStyle={{ color: '#d4e2d7' }}
            itemStyle={{ color: '#fff' }}
            labelFormatter={(value) =>
              new Date(String(value) + 'T12:00:00').toLocaleDateString('vi-VN')
            }
            formatter={(value) => formatter(Number(value))}
          />
          {lines.map((line, index) =>
            index === 0 && area ? (
              <Area
                key={line.key}
                dataKey={line.key}
                name={line.name}
                type="monotone"
                stroke={line.color}
                fill={'url(#' + id + ')'}
                strokeWidth={2.3}
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : (
              <Line
                key={line.key}
                dataKey={line.key}
                name={line.name}
                type="monotone"
                stroke={line.color}
                strokeWidth={index === 0 ? 2.3 : 1.8}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
export function AllocationChart({ factors }: { factors: Factor[] }) {
  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={205}>
        <PieChart>
          <Pie
            data={factors}
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
            {factors.map((item, i) => (
              <Cell key={item.symbol} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => number(Number(value) * 100, 1) + '%'} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>{factors.length}</strong>
        <span>tài sản</span>
      </div>
    </div>
  );
}
export function FactorChart({
  factors,
  metric,
}: {
  factors: Factor[];
  metric: 'beta' | 'momentum';
}) {
  const data = factors.map((f) => ({ symbol: f.symbol, value: f[metric] }));
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40, top: 14, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#e7ebe3" strokeDasharray="3 5" />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#879087' }}
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
            tick={{ fontSize: 12, fill: '#506056' }}
          />
          <Tooltip
            cursor={{ fill: '#f2f5ed' }}
            formatter={(v) =>
              number(metric === 'momentum' ? Number(v) * 100 : Number(v), 2) +
              (metric === 'momentum' ? '%' : '')
            }
          />
          <ReferenceLine x={0} stroke="#b8c4b8" />
          <Bar
            dataKey="value"
            name={metric === 'beta' ? 'Beta so với SPY' : 'Momentum 12–1'}
            barSize={19}
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
          >
            {data.map((item, i) => (
              <Cell key={item.symbol} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
