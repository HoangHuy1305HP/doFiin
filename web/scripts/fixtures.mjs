// Deterministic API fixtures for UI verification (no backend needed).
// Shapes follow web/src/types.ts and docs/openapi.json.

let seed = 20261025;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const gauss = () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

export const USER = { id: 'u-1', email: 'demo@example.com', display_name: 'Minh Anh' };

export const INSTRUMENTS = [
  { id: 'i-aapl', symbol: 'AAPL', name: 'Apple Inc.', asset_type: 'stock' },
  { id: 'i-msft', symbol: 'MSFT', name: 'Microsoft', asset_type: 'stock' },
  { id: 'i-nvda', symbol: 'NVDA', name: 'NVIDIA', asset_type: 'stock' },
  { id: 'i-spy', symbol: 'SPY', name: 'SPDR S&P 500', asset_type: 'etf' },
];

export const PORTFOLIO = {
  id: 'p-1',
  name: 'Danh mục dài hạn',
  description: 'Không gian trải nghiệm demo 1',
  current_version: 2,
  archived_at: null,
  latest_version: {
    id: 'v-2',
    version_number: 2,
    created_at: '2026-10-20T09:00:00Z',
    allocations: [
      { instrument_id: 'i-aapl', symbol: 'AAPL', weight: '0.45' },
      { instrument_id: 'i-msft', symbol: 'MSFT', weight: '0.35' },
      { instrument_id: 'i-nvda', symbol: 'NVDA', weight: '0.2' },
    ],
  },
};

function buildSeries(days) {
  const dates = [];
  const end = new Date('2026-10-24T12:00:00Z');
  for (let i = days; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    dates.push(d.toISOString().slice(0, 10));
  }
  let p = 100;
  let b = 100;
  let peak = 100;
  let maxDd = 0;
  const rows = [];
  const mas = [];
  const mals = [];
  dates.forEach((date, i) => {
    p *= 1 + 0.0006 + 0.011 * gauss();
    b *= 1 + 0.0004 + 0.008 * gauss();
    peak = Math.max(peak, p);
    const dd = p / peak - 1;
    maxDd = Math.min(maxDd, dd);
    mas.push(p);
    mals.push(p);
    const ma20 = mas.slice(-20).reduce((s, v) => s + v, 0) / Math.min(mas.length, 20);
    const ma50 = mals.slice(-50).reduce((s, v) => s + v, 0) / Math.min(mals.length, 50);
    const vol =
      rows.length >= 20
        ? (() => {
            const rets = rows
              .slice(-19)
              .map((r) => r.portfolio / rows[rows.length - 20].portfolio - 1);
            const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
            const varr = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / rets.length;
            return Math.sqrt(varr) * Math.sqrt(252);
          })()
        : null;
    rows.push({
      date,
      portfolio: Number(p.toFixed(4)),
      benchmark: Number(b.toFixed(4)),
      drawdown: Number(dd.toFixed(4)),
      volatility: vol == null ? null : Number(vol.toFixed(4)),
      rolling_beta: Number((0.9 + 0.2 * rand()).toFixed(3)),
      ma_short: Number(ma20.toFixed(4)),
      ma_long: Number(ma50.toFixed(4)),
    });
  });
  return rows;
}

const SERIES = buildSeries(380);
const LAST = SERIES.at(-1);

export const ANALYSIS = {
  id: 'a-1',
  portfolio_version_id: 'v-2',
  created_at: '2026-10-25T03:00:00Z',
  result: {
    metrics: {
      total_return: 0.1842,
      cagr: 0.1712,
      annualized_volatility: 0.1643,
      sharpe_ratio: 1.13,
      max_drawdown: -0.1291,
      beta: 1.08,
      capm_alpha: 0.0431,
      excess_return: 0.0378,
    },
    series: SERIES,
    correlation: {
      symbols: ['AAPL', 'MSFT', 'NVDA'],
      matrix: [
        [1.0, 0.62, 0.48],
        [0.62, 1.0, 0.55],
        [0.48, 0.55, 1.0],
      ],
    },
    factors: [
      {
        symbol: 'AAPL',
        weight: 0.45,
        beta: 1.12,
        momentum: 0.231,
        period_return: 0.2213,
        volatility: 0.2112,
      },
      {
        symbol: 'MSFT',
        weight: 0.35,
        beta: 0.94,
        momentum: 0.158,
        period_return: 0.1467,
        volatility: 0.1763,
      },
      {
        symbol: 'NVDA',
        weight: 0.2,
        beta: 1.71,
        momentum: 0.412,
        period_return: 0.3184,
        volatility: 0.3826,
      },
    ],
    momentum_12_1: 0.2246,
    signals: {
      current: 'BULLISH',
      history: [
        { date: '2026-09-28', state: 'NEUTRAL' },
        { date: '2026-10-06', state: 'BULLISH' },
        { date: '2026-10-13', state: 'NEUTRAL' },
        { date: '2026-10-20', state: 'BULLISH' },
      ],
      short_window: 20,
      long_window: 50,
    },
    metadata: {
      source: 'demo',
      is_demo: true,
      data_as_of: '2026-10-24',
      first_date: SERIES[0].date,
      last_date: LAST.date,
      observations: SERIES.length,
      benchmark: 'SPY',
      portfolio_name: PORTFOLIO.name,
      version_number: 2,
      warnings: [],
      methodology: 'Buy-and-hold, tỷ trọng đầu kỳ · 252 phiên/năm',
      risk_free_rate: 0.02,
    },
  },
};

function backtestSeries() {
  let v = 10000;
  let b = 10000;
  return SERIES.map((row) => {
    const invested = row.ma_short > row.ma_long;
    v *=
      1 +
      (invested ? row.portfolio / SERIES[SERIES.indexOf(row) - 1 || 0].portfolio - 1 || 0 : 0.0001);
    b *= 1 + (row.benchmark / (SERIES[SERIES.indexOf(row) - 1]?.benchmark || row.benchmark) - 1);
    return {
      date: row.date,
      strategy: Number(v.toFixed(2)),
      benchmark: Number(b.toFixed(2)),
      drawdown: row.drawdown,
    };
  });
}

export const BACKTEST = {
  id: 'bt-1',
  parameters: { analysis_run_id: 'a-1' },
  result: {
    metrics: {
      total_return: 0.2118,
      final_value: 12118.4,
      max_drawdown: -0.1003,
      total_cost: 104.62,
      trade_count: 14,
    },
    series: backtestSeries(),
    trades: [
      { date: '2026-01-15', action: 'INVEST', turnover: 10000, cost: 15.0 },
      { date: '2026-02-12', action: 'REBALANCE', turnover: 1240.5, cost: 6.2 },
      { date: '2026-03-16', action: 'CASH', turnover: 11032.8, cost: 11.03 },
      { date: '2026-04-20', action: 'INVEST', turnover: 10890.2, cost: 10.89 },
      { date: '2026-05-14', action: 'REBALANCE', turnover: 986.1, cost: 4.93 },
      { date: '2026-06-18', action: 'CASH', turnover: 11755.9, cost: 11.76 },
      { date: '2026-07-16', action: 'INVEST', turnover: 11602.4, cost: 11.6 },
      { date: '2026-08-13', action: 'REBALANCE', turnover: 1310.7, cost: 6.55 },
      { date: '2026-09-17', action: 'CASH', turnover: 12488.3, cost: 12.49 },
      { date: '2026-10-08', action: 'INVEST', turnover: 12310.5, cost: 12.31 },
    ],
    assumptions: {
      fill: 'Giá đóng cửa phiên sau tín hiệu',
      fees: '10 bps trên turnover',
      slippage: '5 bps trên turnover',
    },
    metadata: ANALYSIS.result.metadata,
  },
};

export const OPTIMIZATION = {
  weights: [
    { symbol: 'AAPL', weight: '0.32' },
    { symbol: 'MSFT', weight: '0.43' },
    { symbol: 'NVDA', weight: '0.25' },
  ],
  estimated_sharpe: 1.31,
  warning: 'Kết quả ước lượng trên dữ liệu quá khứ của chính danh mục.',
};

const ORDERS = {
  portfolio: ['growth', 'allocation', 'assets'],
  risk: ['drawdown', 'correlation', 'volatility'],
  signals: ['moving_average', 'signal_history'],
  backtest: ['backtest_growth', 'backtest_trades'],
  factors: ['beta', 'momentum', 'factor_table'],
};
export const layoutFor = (page) => ({
  revision: 0,
  config: {
    order: ORDERS[page] || ORDERS.portfolio,
    hidden: [],
    titles: {},
    density: 'comfortable',
    chart_style: 'area',
  },
});

export const PLANS = [
  { code: 'free', name: 'Free', monthly_price: 0, portfolios: 1, history_years: 1, layouts: 0 },
  { code: 'plus', name: 'Plus', monthly_price: 99000, portfolios: 5, history_years: 5, layouts: 3 },
  {
    code: 'pro',
    name: 'Pro',
    monthly_price: 199000,
    portfolios: 20,
    history_years: null,
    layouts: null,
  },
];

export const SUBSCRIPTION = {
  plan_code: 'free',
  billing_cycle: 'monthly',
  plans: PLANS,
  is_demo: true,
  portfolio_count: 1,
  notice: 'Giá và quyền lợi minh họa cho demo 1, không có thanh toán thật.',
};

export const VERSIONS = [
  PORTFOLIO.latest_version,
  {
    id: 'v-1',
    version_number: 1,
    created_at: '2026-10-12T09:00:00Z',
    allocations: [
      { instrument_id: 'i-aapl', symbol: 'AAPL', weight: '0.5' },
      { instrument_id: 'i-msft', symbol: 'MSFT', weight: '0.5' },
    ],
  },
];

/** Route handler for /api/v1/** — mirrors the endpoints App.tsx calls. */
export function handleApi(path, method, body) {
  const json = (data, status = 200) => ({ status, body: JSON.stringify(data) });
  if (path === '/auth/refresh' && method === 'POST')
    return json({ access_token: 'tok', token_type: 'bearer', expires_in: 900 });
  if (path === '/auth/login' && method === 'POST')
    return json({ access_token: 'tok', token_type: 'bearer', expires_in: 900 });
  if (path === '/auth/register' && method === 'POST') return json({ ...USER, id: 'u-2' }, 201);
  if (path === '/auth/logout' && method === 'POST') return { status: 204, body: '' };
  if (path === '/users/me') return json(USER);
  if (path === '/instruments') return json(INSTRUMENTS);
  if (path === '/portfolios' && method === 'GET') return json([PORTFOLIO]);
  if (path === '/portfolios' && method === 'POST') return json(PORTFOLIO, 201);
  if (/^\/portfolios\/[^/]+$/.test(path) && method === 'GET') return json(PORTFOLIO);
  if (/^\/layouts\/.+$/.test(path) && method === 'GET')
    return json(layoutFor(path.split('/').pop()));
  if (/^\/portfolios\/[^/]+\/configuration$/.test(path)) return json(PORTFOLIO);
  if (/^\/portfolios\/[^/]+\/versions$/.test(path)) return json(VERSIONS);
  if (/^\/portfolios\/[^/]+\/archive$/.test(path))
    return json({ ...PORTFOLIO, archived_at: 'now' });
  if (path === '/analysis-runs' && method === 'POST') return json(ANALYSIS, 201);
  if (/^\/analysis-runs\/[^/]+\/optimize$/.test(path)) return json(OPTIMIZATION);
  if (path === '/backtest-runs' && method === 'POST') return json(BACKTEST, 201);
  if (/^\/layouts\/.+$/.test(path) && method === 'PUT')
    return json({ revision: 1, config: body.config });
  if (path === '/subscription' && method === 'GET') return json(SUBSCRIPTION);
  if (path === '/subscription/demo' && method === 'PUT')
    return json({
      ...SUBSCRIPTION,
      plan_code: body?.plan_code || 'free',
      billing_cycle: body?.billing_cycle || 'monthly',
    });
  return json(
    { error: { code: 'NOT_FOUND', message: 'No fixture for ' + method + ' ' + path } },
    404,
  );
}
