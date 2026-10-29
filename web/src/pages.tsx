import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleHelp,
  FlaskConical,
  Lightbulb,
  Play,
  TrendingUp,
} from 'lucide-react';
import { AllocationChart, COLORS, FactorChart, TimeChart } from './charts';
import { dateLabel, money, number, percent } from './api';
import type { Presentation, SectionAppearance } from './preferences';
import type { Analysis, Backtest, LayoutConfig, Page } from './types';

export const TITLES: Record<string, string> = {
  growth: 'Cumulative growth',
  allocation: 'Current weights',
  assets: 'Contribution by asset',
  insight: 'A smarter allocation to explore',
  drawdown: 'Drawdown over time',
  correlation: 'Relationships between assets',
  volatility: 'Volatility over time',
  risk_note: 'Risk in context',
  moving_average: 'Moving average crossover',
  signal_history: 'Recent states',
  signal_note: 'Rule explained',
  backtest_growth: 'Growth comparison',
  backtest_trades: 'Simulated trades',
  backtest_note: 'Simulation assumptions',
  beta: 'Market sensitivity',
  momentum: '12–1 momentum',
  factor_table: 'Factors by asset',
  factor_note: 'Model explained',
};
export const ORDERS: Record<Page, string[]> = {
  portfolio: ['growth', 'allocation', 'assets', 'insight'],
  risk: ['correlation', 'drawdown', 'volatility', 'risk_note'],
  signals: ['moving_average', 'signal_history', 'signal_note'],
  backtest: ['backtest_growth', 'backtest_trades', 'backtest_note'],
  factors: ['beta', 'momentum', 'factor_table', 'factor_note'],
};
function isDarkBackground(background?: string): boolean {
  if (!background || !/^#[0-9a-f]{6}$/i.test(background)) return false;
  const luminance = [1, 3, 5]
    .map((index) => parseInt(background.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance < 0.2;
}
export function defaultLayout(page: Page): LayoutConfig {
  return {
    order: [...ORDERS[page]],
    hidden: [],
    titles: {},
    density: 'comfortable',
    chart_style: 'area',
  };
}
export function Metric({
  label,
  value,
  detail,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <CircleHelp size={12} aria-hidden="true" />
      </div>
      <strong className={positive === true ? 'positive' : positive === false ? 'negative' : ''}>
        {value}
      </strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}
export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.name}>
          <i style={{ background: item.color }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}
export type BacktestForm = {
  strategy: string;
  initial_capital: number;
  fee_bps: number;
  slippage_bps: number;
  rebalance_frequency: string;
};
export const DEFAULT_BACKTEST: BacktestForm = {
  strategy: 'MA_CROSSOVER',
  initial_capital: 10000,
  fee_bps: 10,
  slippage_bps: 5,
  rebalance_frequency: 'MONTHLY',
};
type Props = {
  page: Page;
  analysis: Analysis;
  layout: LayoutConfig;
  backtest: Backtest | null;
  btBusy: boolean;
  btForm: BacktestForm;
  setBtForm: (form: BacktestForm) => void;
  onBacktest: () => void;
  onOptimize: () => void;
  preview?: boolean;
  selectedSection?: string;
  controls?: ReactNode;
  presentation?: Presentation;
  sectionAppearance?: Record<string, SectionAppearance>;
  btStale?: boolean;
};
export function Dashboard({
  page,
  analysis,
  layout,
  backtest,
  btBusy,
  btForm,
  setBtForm,
  onBacktest,
  onOptimize,
  preview = false,
  selectedSection,
  controls,
  presentation,
  sectionAppearance,
  btStale = false,
}: Props) {
  const { metrics: m, series, factors, signals, correlation, metadata } = analysis.result;
  const areaFor = (key: string) => (sectionAppearance?.[key]?.chartStyle ?? layout.chart_style) === 'area';
  const widgets: Record<string, ReactNode> = {};
  widgets.growth = (
    <>
      <div className="growth-meta">
        <span>
          Cumulative
          <br />
          100 at the start
        </span>
        <span>
          {metadata.observations}
          <br />
          sessions
        </span>
      </div>
      <TimeChart
        data={series}
        lines={[
          { key: 'portfolio', name: 'Portfolio', color: 'var(--chart-accent, #0f172a)' },
          { key: 'benchmark', name: 'SPY', color: '#64748b' },
        ]}
        area={areaFor('growth')}
      />
      <Legend
        items={[
          { name: 'Portfolio', color: 'var(--chart-accent, #0f172a)' },
          { name: 'SPY', color: '#64748b' },
        ]}
      />
    </>
  );
  widgets.allocation = (
    <>
      <AllocationChart factors={factors} />
      <div className="allocation-list">
        {factors.map((asset, i) => (
          <div key={asset.symbol}>
            <span>
              <i style={{ background: COLORS[i % COLORS.length] }} />
              {asset.symbol}
            </span>
            <strong>{percent(asset.weight, 0)}</strong>
          </div>
        ))}
        {factors.reduce((total, asset) => total + asset.weight, 0) < 1 - 1e-9 && (
          <div>
            <span><i style={{ background: '#cbd5e1' }} />USD cash</span>
            <strong>{percent(1 - factors.reduce((total, asset) => total + asset.weight, 0), 0)}</strong>
          </div>
        )}
      </div>
      <div className="small-note">Target weights at the start of the period</div>
    </>
  );
  widgets.assets = (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SYMBOL</th>
              <th>WEIGHT</th>
              <th>RETURN</th>
              <th>CONTRIB.</th>
            </tr>
          </thead>
          <tbody>
            {factors.map((asset) => (
              <tr key={asset.symbol}>
                <td>
                  <strong>{asset.symbol}</strong>
                </td>
                <td>{percent(asset.weight)}</td>
                <td className={(asset.period_return ?? 0) >= 0 ? 'positive' : 'negative'}>
                  {percent(asset.period_return)}
                </td>
                <td>
                  <strong>
                    {asset.period_return == null
                      ? '—'
                      : percent(asset.weight * asset.period_return)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
  widgets.insight = (
    <div className="insight-content">
      <div className="insight-icon">
        <Lightbulb size={23} />
      </div>
      <div>
        <span className="eyebrow light">WEIGHT SEARCH SIMULATION</span>
        <h3>A smarter allocation to explore</h3>
        <p>
          Portfolio{' '}
          {m.excess_return != null && m.excess_return >= 0 ? 'outperformed' : 'underperformed'}{' '}
          benchmark {percent(Math.abs(m.excess_return ?? 0))} this period. Compare current weights
          with an alternative allocation from the historical model.
        </p>
        <button className="button lime" disabled={preview} onClick={onOptimize}>
          View simulation →
        </button>
      </div>
      <svg className="insight-art" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        {[0, 12, 24, 36, 48].map((n) => (
          <path
            key={n}
            d={'M' + (10 + n / 2) + ' ' + (100 - n / 2) + ' L100 ' + (10 + n / 2) + ' L100 100 Z'}
            stroke="#fef3c7"
            strokeWidth=".7"
          />
        ))}
      </svg>
    </div>
  );
  widgets.drawdown = (
    <>
      <div className="chart-topline">
        <div>
          <span className="micro-label">MAX DRAWDOWN</span>
          <strong className="negative">{percent(m.max_drawdown)}</strong>
        </div>
        <span className="subtle">Change since the previous peak</span>
      </div>
      <TimeChart
        data={series}
        lines={[{ key: 'drawdown', name: 'Drawdown', color: 'var(--chart-accent, #475569)' }]}
        kind="percent"
        area={areaFor('drawdown')}
      />
    </>
  );
  widgets.correlation = (
    <>
      <p className="card-description">Relationships between assets, from −1 to +1.</p>
      <div className="correlation-scroll">
        <div
          className="correlation-matrix"
          style={{
            gridTemplateColumns:
              '44px repeat(' + correlation.symbols.length + ', minmax(45px, 1fr))',
          }}
        >
          <span />
          {correlation.symbols.map((s) => (
            <span key={s} className="matrix-label">
              {s}
            </span>
          ))}
          {correlation.symbols.map((s, i) => (
            <div className="matrix-row" key={s}>
              <span className="matrix-label">{s}</span>
              {correlation.matrix[i].map((v, j) => (
                <span
                  key={j}
                  className="matrix-value"
                  style={{
                    background:
                      v == null
                        ? '#f8fafc'
                        : v < 0
                          ? '#e5d4c8'
                          : 'rgba(27,76,57,' + (0.14 + Math.abs(v) * 0.86) + ')',
                    color: v != null && v > 0.55 ? '#fff' : '#334155',
                  }}
                >
                  {number(v)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="matrix-scale">
        <span>Less correlated</span>
        <i />
        <span>Move together</span>
      </div>
    </>
  );
  widgets.volatility = (
    <>
      <Legend items={[{ name: '20-session volatility', color: 'var(--chart-accent, #0f172a)' }]} />
      <TimeChart
        data={series}
        lines={[
          {
            key: 'volatility',
            name: 'Annualized volatility',
            color: 'var(--chart-accent, #0f172a)',
          },
        ]}
        kind="percent"
        height={225}
        area={areaFor('volatility')}
      />
    </>
  );
  widgets.risk_note = (
    <div className="explanation">
      <span className="note-icon">
        <CircleHelp size={20} />
      </span>
      <div>
        <h4>Risk, from every angle.</h4>
        <p>
          Volatility measures variation; drawdown measures declines from a peak. Beta{' '}
          {number(m.beta)} describes sensitivity to SPY during the selected period. These metrics do
          not predict maximum future losses.
        </p>
        <small>
          Risk-free rate: {percent(metadata.risk_free_rate)} / year · Based on 252 sessions per
          year.
        </small>
      </div>
    </div>
  );
  widgets.moving_average = (
    <>
      <div className="chart-topline">
        <span className={'signal-badge ' + signals.current.toLowerCase()}>
          <i />
          {signals.current === 'BULLISH'
            ? 'Bullish'
            : signals.current === 'BEARISH'
              ? 'Bearish'
              : 'Neutral'}
        </span>
        <Legend
          items={[
            { name: 'MA' + signals.short_window, color: 'var(--chart-accent, #0f172a)' },
            { name: 'MA' + signals.long_window, color: '#94a3b8' },
          ]}
        />
      </div>
      <TimeChart
        data={series}
        lines={[
          {
            key: 'ma_short',
            name: 'MA' + signals.short_window,
            color: 'var(--chart-accent, #0f172a)',
          },
          { key: 'ma_long', name: 'MA' + signals.long_window, color: '#94a3b8' },
        ]}
        area={false}
        height={320}
      />
      <div className="small-note">
        Normalized to the portfolio. Signals describe historical context.
      </div>
    </>
  );
  widgets.signal_history = (
    <div className="signal-history">
      {signals.history.map((item) => (
        <div key={item.date}>
          <span>{dateLabel(item.date)}</span>
          <span className={'signal-badge ' + item.state.toLowerCase()}>
            {item.state === 'BULLISH'
              ? 'Bullish'
              : item.state === 'BEARISH'
                ? 'Bearish'
                : 'Neutral'}
          </span>
        </div>
      ))}
    </div>
  );
  widgets.signal_note = (
    <div className="explanation">
      <TrendingUp size={22} />
      <div>
        <h4>Clear rules. Consistent interpretation.</h4>
        <p>
          Bullish when MA{signals.short_window} exceeds MA{signals.long_window} by more than 0.5%;
          bearish when below by more than 0.5%; otherwise neutral. The crossover backtest executes
          direct crossovers in the next session.
        </p>
      </div>
    </div>
  );
  widgets.beta = (
    <>
      <p className="card-description">
        Beta of each asset relative to SPY during the selected period.
      </p>
      <FactorChart factors={factors} metric="beta" color={sectionAppearance?.beta?.chartColor} />
      <div className="small-note">Beta &gt; 1: more sensitive · Beta &lt; 1: less sensitive</div>
    </>
  );
  widgets.momentum = (
    <>
      <p className="card-description">12-month price change, excluding the most recent month.</p>
      <FactorChart factors={factors} metric="momentum" color={sectionAppearance?.momentum?.chartColor} />
      <div className="small-note">
        Requires at least 253 sessions of history, including the initialization period.
      </div>
    </>
  );
  widgets.factor_table = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Beta / SPY</th>
            <th>Momentum 12–1</th>
            <th>Role in portfolio</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((asset) => (
            <tr key={asset.symbol}>
              <td>
                <strong>{asset.symbol}</strong>
              </td>
              <td>{number(asset.beta)}</td>
              <td className={(asset.momentum ?? 0) >= 0 ? 'positive' : 'negative'}>
                {percent(asset.momentum)}
              </td>
              <td>
                {asset.beta == null
                  ? 'Insufficient data'
                  : asset.beta > 1
                    ? 'More sensitive to market moves'
                    : 'Less sensitive to market moves'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  widgets.factor_note = (
    <div className="explanation">
      <Lightbulb size={22} />
      <div>
        <h4>Understand what drives returns.</h4>
        <p>
          Market beta and momentum are descriptive metrics, rather than a full factor regression.
          CAPM alpha is shown separately from excess benchmark return.
        </p>
        <small>
          Annualized CAPM alpha: {percent(m.capm_alpha)} · Excess return vs SPY:{' '}
          {percent(m.excess_return)}
        </small>
      </div>
    </div>
  );
  const b = backtest?.result;
  widgets.backtest_growth = b ? (
    <>
      <Legend
        items={[
          { name: 'Strategy after costs', color: 'var(--chart-accent, #0f172a)' },
          { name: 'SPY before costs', color: '#94a3b8' },
        ]}
      />
      <TimeChart
        data={b.series}
        lines={[
          { key: 'strategy', name: 'Strategy', color: 'var(--chart-accent, #0f172a)' },
          { key: 'benchmark', name: 'SPY', color: '#94a3b8' },
        ]}
        kind="money"
        area={areaFor('backtest_growth')}
        height={310}
      />
    </>
  ) : (
    <div className="empty-chart">
      <FlaskConical size={32} />
      <h4>Backtest a simple rule.</h4>
      <p>Configure and run a backtest to explore the results.</p>
      <button className="button primary" onClick={onBacktest} disabled={btBusy}>
        <Play size={15} />
        Run backtest
      </button>
    </div>
  );
  widgets.backtest_trades = b ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Execution date</th>
            <th>Action</th>
            <th>Turnover</th>
            <th>Total costs</th>
          </tr>
        </thead>
        <tbody>
          {b.trades
            .slice(-15)
            .reverse()
            .map((trade, i) => (
              <tr key={trade.date + i}>
                <td>{dateLabel(trade.date)}</td>
                <td>
                  <span className="tag">
                    {trade.action === 'INVEST'
                      ? 'Invest'
                      : trade.action === 'CASH'
                        ? 'Hold cash'
                        : 'Rebalance'}
                  </span>
                </td>
                <td>{money(trade.turnover)}</td>
                <td>{money(trade.cost)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {!b.trades.length && <p className="small-note">No trades in the selected period.</p>}
      <div className="small-note">
        Showing the latest 15 trades · Export CSV for the full history.
      </div>
    </div>
  ) : (
    <p className="card-description">Trade history appears after running the backtest.</p>
  );
  widgets.backtest_note = (
    <div className="explanation">
      <CircleHelp size={22} />
      <div>
        <h4>A backtest is a conditional simulation.</h4>
        <p>
          Signals use information from the previous close and execute at the next close. Fees and
          slippage apply to turnover; no shorting or borrowing. Past results do not guarantee future
          performance.
        </p>
      </div>
    </div>
  );
  let metrics: ReactNode;
  if (page === 'risk')
    metrics = (
      <>
        <Metric
          label="Annualized volatility"
          value={percent(m.annualized_volatility)}
          detail="Standard deviation of daily returns"
        />
        <Metric
          label="Max drawdown"
          value={percent(m.max_drawdown)}
          detail="Peak-to-trough decline in the period"
          positive={false}
        />
        <Metric
          label="Beta vs SPY"
          value={number(m.beta)}
          detail="Sensitivity to market movements"
        />
      </>
    );
  else if (page === 'factors')
    metrics = (
      <>
        <Metric
          label="Portfolio beta"
          value={number(m.beta)}
          detail="Relative to SPY in this period"
        />
        <Metric
          label="Momentum 12–1"
          value={percent(analysis.result.momentum_12_1)}
          detail="Excluding the latest month"
        />
        <Metric
          label="Annualized CAPM alpha"
          value={percent(m.capm_alpha)}
          detail="Adjusted for market beta"
        />
        <Metric
          label="Assets analyzed"
          value={String(factors.length)}
          detail="Same source and trading calendar"
        />
      </>
    );
  else if (page === 'signals')
    metrics = (
      <>
        <Metric
          label="Current state"
          value={
            signals.current === 'BULLISH'
              ? 'Bullish'
              : signals.current === 'BEARISH'
                ? 'Bearish'
                : 'Neutral'
          }
          detail="Based on a 0.5% MA difference"
          positive={signals.current === 'BULLISH' ? true : undefined}
        />
        <Metric
          label="Short-term MA"
          value={number(series.at(-1)?.ma_short as number)}
          detail={signals.short_window + ' sessions · Normalized index'}
        />
        <Metric
          label="Long-term MA"
          value={number(series.at(-1)?.ma_long as number)}
          detail={signals.long_window + ' sessions · Normalized index'}
        />
        <Metric
          label="Last observation"
          value={metadata.last_date.slice(8) + '/' + metadata.last_date.slice(5, 7)}
          detail={metadata.last_date.slice(0, 4) + '· Same portfolio dataset'}
        />
      </>
    );
  else if (page === 'backtest')
    metrics = (
      <>
        <Metric
          label="Strategy return"
          value={percent(b?.metrics.total_return)}
          detail="After fees and slippage"
          positive={(b?.metrics.total_return ?? 0) >= 0}
        />
        <Metric
          label="Final value"
          value={money(b?.metrics.final_value)}
          detail="Based on your simulated initial capital"
        />
        <Metric
          label="Max drawdown"
          value={percent(b?.metrics.max_drawdown)}
          detail="Including transaction costs"
          positive={false}
        />
        <Metric
          label="Total costs"
          value={money(b?.metrics.total_cost)}
          detail={String(b?.metrics.trade_count ?? 0) + ' simulated trades'}
        />
      </>
    );
  else
    metrics = (
      <>
        <Metric
          label="Portfolio return"
          value={percent(m.total_return)}
          detail={
            (m.excess_return !== null
              ? ((m.excess_return ?? 0) >= 0 ? '+' : '') + percent(m.excess_return)
              : '—') + ' vs SPY'
          }
        />
        <Metric
          label="Annualized volatility"
          value={percent(m.annualized_volatility)}
          detail="Annualized · 252 sessions"
        />
        <Metric
          label="Sharpe ratio"
          value={number(m.sharpe_ratio)}
          detail={`rf = ${percent(metadata.risk_free_rate)}`}
        />
      </>
    );
  return (
    <div
      className={'dashboard ' + (layout.density === 'compact' ? 'compact' : '')}
      style={
        presentation
          ? ({
              '--chart-accent': presentation.color,
              '--widget-corners': presentation.corners + 'px',
            } as CSSProperties)
          : undefined
      }
    >
      {page === 'backtest' && !preview && (
        <div className="backtest-config">
          <div className="config-intro">
            <FlaskConical size={18} />
            <div>
              <strong>Backtest settings</strong>
              <span>Uses the current analysis dataset</span>
            </div>
          </div>
          <div className="backtest-fields">
            <label>
              Strategy
              <select
                value={btForm.strategy}
                onChange={(e) => setBtForm({ ...btForm, strategy: e.target.value })}
              >
                <option value="MA_CROSSOVER">MA {signals.short_window} / {signals.long_window} crossover</option>
                <option value="BUY_AND_HOLD">Buy and hold</option>
              </select>
            </label>
            <label>
              Initial capital (USD)
              <input
                type="number"
                min={100}
                max={1e9}
                value={btForm.initial_capital}
                onChange={(e) => setBtForm({ ...btForm, initial_capital: Number(e.target.value) })}
              />
            </label>
            <label>
              Fees (bps)
              <input
                type="number"
                min={0}
                max={100}
                value={btForm.fee_bps}
                onChange={(e) => setBtForm({ ...btForm, fee_bps: Number(e.target.value) })}
              />
            </label>
            <label>
              Slippage (bps)
              <input
                type="number"
                min={0}
                max={100}
                value={btForm.slippage_bps}
                onChange={(e) => setBtForm({ ...btForm, slippage_bps: Number(e.target.value) })}
              />
            </label>
            <label>
              Rebalance
              <select
                value={btForm.rebalance_frequency}
                onChange={(e) => setBtForm({ ...btForm, rebalance_frequency: e.target.value })}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="NONE">None</option>
              </select>
            </label>
            <button className="button primary" disabled={btBusy} onClick={onBacktest}>
              <Play size={14} />
              {btBusy ? 'Running backtest…' : 'Run backtest'}
            </button>
          </div>
          {btStale && (
            <p className="small-note warning-text">
              Settings changed. Run again to update results. 100 bps = 1%.
            </p>
          )}
        </div>
      )}
      <div className="metrics-strip">{metrics}</div>
      {controls}
      <div className="widgets-grid">
        {layout.order
          .filter((key) => !layout.hidden.includes(key))
          .map((key) => (
            <section
              className={'widget widget-' + key + (key === 'insight' ? ' dark-widget' : '') + (preview && selectedSection === key ? ' studio-section-selected' : '')}
              key={key}
              aria-label={layout.titles[key] || TITLES[key]}
              data-studio-section={preview ? key : undefined}
              data-section-width={sectionAppearance?.[key]?.width || 'stretch'}
              data-section-height={sectionAppearance?.[key]?.height || 'auto'}
              data-section-spacing={sectionAppearance?.[key]?.spacing || 'comfortable'}
              data-section-background={sectionAppearance?.[key]?.background || 'default'}
              data-section-dark={isDarkBackground(sectionAppearance?.[key]?.background)}
              data-legend={sectionAppearance?.[key]?.showLegend ?? presentation?.legend ?? true}
              style={{
                '--section-radius': `${sectionAppearance?.[key]?.corners ?? presentation?.corners ?? 0}px`,
                '--chart-accent': sectionAppearance?.[key]?.chartColor ?? (isDarkBackground(sectionAppearance?.[key]?.background) ? '#bfdbfe' : presentation?.color ?? '#0f172a'),
                backgroundColor: sectionAppearance?.[key]?.background?.startsWith('#') ? sectionAppearance?.[key]?.background : undefined,
              } as CSSProperties}
            >
              {key !== 'insight' && (
                <div className="widget-heading">
                  <div>
                    <span className="widget-eyebrow">
                      {key === 'allocation'
                        ? 'ALLOCATION'
                        : key === 'growth'
                          ? 'PERFORMANCE'
                          : page === 'portfolio'
                            ? 'COMPONENTS'
                            : page === 'risk'
                              ? 'PORTFOLIO ANALYTICS'
                              : page === 'signals'
                                ? 'SIGNALS'
                                : page === 'factors'
                                  ? 'FACTORS'
                                  : 'BACKTEST'}
                    </span>
                    <h3>{layout.titles[key] || TITLES[key]}</h3>
                  </div>
                  <span className="widget-dot">···</span>
                </div>
              )}
              {widgets[key]}
            </section>
          ))}
      </div>
      {layout.order.every((key) => layout.hidden.includes(key)) && (
        <div className="empty-chart">
          <p>All sections are hidden. Open Studio and choose Add sections to show them again.</p>
        </div>
      )}
    </div>
  );
}
export function ChangeIndicator({ value }: { value: number | null }) {
  return (
    <span className={(value ?? 0) >= 0 ? 'positive' : 'negative'}>
      {(value ?? 0) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{' '}
      {percent(value)}
    </span>
  );
}
