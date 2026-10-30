export type Page = 'portfolio' | 'risk' | 'signals' | 'backtest' | 'factors';
export type User = { id: string; email: string; display_name: string; has_password: boolean };
export type Instrument = { id: string; symbol: string; name: string; asset_type: string };
export type Allocation = { instrument_id: string; symbol: string; weight: string };
export type Version = {
  id: string;
  version_number: number;
  created_at: string;
  purchase_date: string | null;
  initial_capital: string;
  allocations: Allocation[];
};
export type Portfolio = {
  id: string;
  name: string;
  description: string | null;
  profile_role: 'default' | 'benchmark' | null;
  current_version: number;
  archived_at: string | null;
  latest_version: Version;
};
export type Point = { date: string; [key: string]: string | number | null };
export type LiveGrowth = {
  status: string;
  point: { date: string; portfolio: number; benchmark: number } | null;
  as_of: string | null;
};
export type Factor = {
  symbol: string;
  weight: number;
  beta: number | null;
  momentum: number | null;
  period_return: number | null;
  volatility: number | null;
};
export type Metadata = {
  source: 'demo' | 'yahoo' | 'alpaca';
  is_demo: boolean;
  data_as_of: string;
  first_date: string;
  last_date: string;
  observations: number;
  benchmark: string;
  benchmark_portfolio_id?: string | null;
  benchmark_version_number?: number | null;
  portfolio_name: string;
  version_number: number;
  warnings: string[];
  methodology: string;
  risk_free_rate: number;
};
export type Analysis = {
  id: string;
  portfolio_version_id: string;
  created_at: string;
  result: {
    return_distribution?: {return: number; count: number; lower: number; upper: number}[];
    metrics: Record<string, number | null>;
    series: Point[];
    growth_series?: Point[];
    correlation: { symbols: string[]; matrix: (number | null)[][] };
    factors: Factor[];
    momentum_12_1: number | null;
    signals: {
      asset_signals?: {symbol: string; short_ma: number | null; long_ma: number | null; signal: number | null}[];
      series?: Point[];
      current: string;
      history: { date: string; state: string }[];
      short_window: number;
      long_window: number;
    };
    metadata: Metadata;
  };
};
export type AnalysisRules = {
  benchmarkPortfolioId: string;
  riskFreeRate: number;
  shortWindow: number;
  longWindow: number;
};
export type Backtest = {
  id: string;
  parameters: { analysis_run_id: string };
  result: {
    regime_history?: {date: string; state: string; decision_date: string | null}[];
    baseline_metrics?: Record<string, number | null>;
    metrics: Record<string, number | null>;
    series: Point[];
    trades: { date: string; action: string; turnover: number; cost: number }[];
    assumptions: Record<string, string>;
    metadata: Metadata;
  };
};
export type LayoutConfig = {
  order: string[];
  hidden: string[];
  titles: Record<string, string>;
  density: 'comfortable' | 'compact';
  chart_style: 'area' | 'line';
};
export type Layout = { revision: number; config: LayoutConfig };
export type Plan = {
  code: string;
  name: string;
  monthly_price: number;
  portfolios: number;
  history_years: number | null;
  layouts: number | null;
};
export type Subscription = {
  plan_code: string;
  billing_cycle: 'monthly' | 'annual';
  plans: Plan[];
  is_demo: boolean;
  portfolio_count: number;
  notice: string;
};
