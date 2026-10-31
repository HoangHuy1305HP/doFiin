import { useEffect, useState } from 'react';
import {
  CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { number, percent, post } from './api';
import { COLORS } from './charts';

type Scenario = {
  annual_return: number; volatility: number; sharpe: number | null; weights: number[];
};
type Simulation = {
  symbols: string[]; samples: Scenario[]; current: Scenario; optimized: Scenario | null;
  max_weight: number; minimum_cash: number; excluded_symbols: string[]; cash_weight: number; seed: number; observations: number;
  risk_free_rate: number; source: string; first_date: string; last_date: string; warnings: string[];
};
type State = { runId: string; data: Simulation | null; error: string; busy: boolean };

export function usePortfolioSimulation(runId: string, enabled: boolean, assetCount: number, rules?: { maxWeight: number; minimumCash: number; excludedSymbols: string[] }) {
  const [state, setState] = useState<State>({ runId: '', data: null, error: '', busy: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState({ runId, data: null, error: '', busy: true });
    post<Simulation>(`/analysis-runs/${runId}/simulation`, {
      samples: 2000, seed: 42, max_weight: rules?.maxWeight ?? (assetCount === 1 ? 1 : 0.8),
      minimum_cash: rules?.minimumCash ?? 0, excluded_symbols: rules?.excludedSymbols ?? [],
    }).then((data) => {
      if (active) setState({ runId, data, error: '', busy: false });
    }).catch((error) => {
      if (active) setState({ runId, data: null,
        error: error instanceof Error ? error.message : 'Unable to simulate allocations.', busy: false });
    });
    return () => { active = false; };
  }, [runId, enabled, assetCount, rules?.maxWeight, rules?.minimumCash, JSON.stringify(rules?.excludedSymbols || []), retry]);
  return { state: state.runId === runId ? state : { runId, data: null, error: '', busy: true },
    retry: () => setRetry((value) => value + 1) };
}
type Shared = ReturnType<typeof usePortfolioSimulation>;

function Pending({ shared }: { shared: Shared }) {
  return shared.state.error
    ? <div className="simulation-message" role="alert">{shared.state.error}{' '}
      <button type="button" onClick={shared.retry}>Retry</button></div>
    : <div className="simulation-message" role="status">Calculating historical allocation scenarios…</div>;
}

function AllocationPie({ data, weights, title }: { data: Simulation; weights: number[]; title: string }) {
  const slices = data.symbols.map((symbol, i) => ({ symbol, weight: weights[i], color: COLORS[i % COLORS.length] }));
  const cash = Math.max(0, 1 - weights.reduce((sum, weight) => sum + weight, 0));
  if (cash > 1e-9) slices.push({ symbol: 'USD cash', weight: cash, color: '#cbd5e1' });
  return <div className="simulation-pie">
    <h4>{title}</h4>
    <div role="img" aria-label={`${title}: ${slices.map((slice) => `${slice.symbol} ${percent(slice.weight)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart><Pie data={slices} dataKey="weight" nameKey="symbol" innerRadius={57} outerRadius={86}
          paddingAngle={2} stroke="none" isAnimationActive={false}>
          {slices.map((slice) => <Cell key={slice.symbol} fill={slice.color} />)}
        </Pie><Tooltip formatter={(value) => percent(Number(value))} /></PieChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

export function AllocationComparison({ shared, onReview, reviewDisabled = false }: { shared: Shared; onReview: (proposal: Simulation) => void; reviewDisabled?: boolean }) {
  const data = shared.state.data;
  if (!data) return <Pending shared={shared} />;
  return <>
    <p className="card-description">Compare configured starting weights with the historical Max Sharpe proposal. This preview does not change your portfolio.</p>
    <div className="simulation-pies">
      <AllocationPie data={data} weights={data.current.weights} title="Current allocation" />
      {data.optimized ? <AllocationPie data={data} weights={data.optimized.weights} title="Max Sharpe proposal" />
        : <p className="simulation-message">The optimizer did not converge. No replacement allocation is proposed.</p>}
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>Asset</th><th>Current</th><th>Proposed</th><th>Change (pp)</th></tr></thead>
      <tbody>{data.symbols.map((symbol, i) => <tr key={symbol}>
        <td><i className="simulation-swatch" style={{ background: COLORS[i % COLORS.length] }} />{symbol}</td>
        <td>{percent(data.current.weights[i])}</td>
        <td>{data.optimized ? percent(data.optimized.weights[i]) : '—'}</td>
        <td>{data.optimized ? `${number((data.optimized.weights[i] - data.current.weights[i]) * 100, 1)} pp` : '—'}</td>
      </tr>)}
      {(data.cash_weight > 1e-9 || data.minimum_cash > 1e-9) && <tr><td>USD cash</td><td>{percent(data.cash_weight)}</td><td>{data.optimized ? percent(Math.max(0, 1 - data.optimized.weights.reduce((sum, weight) => sum + weight, 0))) : '—'}</td><td>—</td></tr>}
      </tbody></table></div>
    <div className="simulation-footer">
      <span className="small-note">Candidate cap: {percent(data.max_weight, 0)} per asset · Minimum cash: {percent(data.minimum_cash, 0)} · Excluded: {data.excluded_symbols.join(', ') || 'none'}.</span>
      <button type="button" className="button secondary" onClick={() => onReview(data)} disabled={!data.optimized || reviewDisabled}>Review proposal before saving</button>
    </div>
  </>;
}

const percentTick = (value: number) => percent(value, 0);
function cloudColor(sharpe: number | null, low: number, high: number) {
  if (sharpe == null) return '#a1a1aa';
  const fraction = Math.max(0, Math.min(1, (sharpe - low) / Math.max(high - low, 1e-9)));
  return `hsl(${215 - fraction * 55} 45% ${72 - fraction * 40}%)`;
}

export function AllocationCloud({ shared }: { shared: Shared }) {
  const data = shared.state.data;
  if (!data) return <Pending shared={shared} />;
  const sharpes = data.samples.flatMap((point) => point.sharpe == null ? [] : [point.sharpe]);
  const low = sharpes.length ? Math.min(...sharpes) : 0;
  const high = sharpes.length ? Math.max(...sharpes) : 1;
  const current = [{ ...data.current, markerSize: 8, label: 'Current allocation' }];
  const optimized = data.optimized ? [{ ...data.optimized, markerSize: 10, label: 'Max Sharpe proposal' }] : [];
  const cloud = data.samples.map((point) => ({ ...point, markerSize: 1, label: 'Random allocation' }));
  return <>
    <p className="card-description">Each point is a different allocation using the same historical asset returns. Move over a point to inspect its weights.</p>
    <div className="simulation-cloud" role="img" aria-label={`${data.samples.length} simulated allocations. Horizontal axis: annualized volatility. Vertical axis: estimated arithmetic annual return.`}>
      <ResponsiveContainer width="100%" height={350}>
        <ScatterChart margin={{ top: 16, right: 22, bottom: 26, left: 10 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" />
          <XAxis type="number" dataKey="volatility" name="Annualized volatility" tickFormatter={percentTick}
            domain={['auto', 'auto']} tick={{ fontSize: 11 }}
            label={{ value: 'Annualized volatility →', position: 'bottom', offset: 8, fontSize: 12 }} />
          <YAxis type="number" dataKey="annual_return" name="Estimated annual return" tickFormatter={percentTick}
            domain={['auto', 'auto']} width={58} tick={{ fontSize: 11 }} />
          <ZAxis type="number" dataKey="markerSize" domain={[1, 10]} range={[12, 170]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
            const point = payload?.[0]?.payload as (Scenario & { label: string }) | undefined;
            if (!active || !point) return null;
            return <div className="simulation-tooltip"><strong>{point.label}</strong>
              <div>Estimated annual return: {percent(point.annual_return)}</div>
              <div>Annualized volatility: {percent(point.volatility)}</div>
              <div>Sharpe: {number(point.sharpe)}</div>
              {data.symbols.map((symbol, i) => <div key={symbol}>{symbol}: {percent(point.weights[i])}</div>)}
              {data.cash_weight > 1e-9 && <div>USD cash: {percent(data.cash_weight)}</div>}
            </div>;
          }} />
          <Scatter name="Simulated allocations" data={cloud} isAnimationActive={false}>
            {cloud.map((point, i) => <Cell key={i} fill={cloudColor(point.sharpe, low, high)} fillOpacity={0.45} />)}
          </Scatter>
          <Scatter name="Current allocation" data={current} shape="diamond" fill="#0f172a" isAnimationActive={false} />
          <Scatter name="Max Sharpe proposal" data={optimized} shape="star" fill="#b7791f" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
    <div className="simulation-legend"><span>◆ Current</span><span>★ Max Sharpe</span><span>● Random allocations · darker = higher Sharpe</span></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Historical model</th><th>Estimated annual return</th><th>Volatility</th><th>Sharpe</th></tr></thead>
      <tbody><tr><td>Current weights</td><td>{percent(data.current.annual_return)}</td><td>{percent(data.current.volatility)}</td><td>{number(data.current.sharpe)}</td></tr>
        {data.optimized && <tr><td>Max Sharpe proposal</td><td>{percent(data.optimized.annual_return)}</td><td>{percent(data.optimized.volatility)}</td><td>{number(data.optimized.sharpe)}</td></tr>}
      </tbody></table></div>
    <p className="small-note">{data.source} · {data.first_date} — {data.last_date} · {data.observations} daily returns · {data.samples.length} scenarios · rf {percent(data.risk_free_rate)} · seed {data.seed}.</p>
    <p className="small-note">Estimated annual return is an arithmetic model estimate, not CAGR or a forecast. The random cloud is not an exact efficient frontier. Trading costs are excluded.</p>
    <details className="small-note"><summary>Model assumptions and limitations</summary><ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
  </>;
}
