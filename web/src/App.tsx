import { useEffect, useRef, useState } from 'react';
import { matchRoutes, Navigate, NavLink, useLocation, useNavigate } from 'react-router';
import {
  Archive,
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  Download,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import Auth, { BrandHome } from './Auth';
import { useLanguage } from './i18n';
import LanguageSelect from './LanguageSelect';
import StudioModeSwitch from './StudioModeSwitch';
import { INTRADAY_RANGES } from './IntradayGrowth';
import type { IntradayRange } from './IntradayGrowth';
import {
  api,
  ApiError,
  dateLabel,
  number,
  percent,
  post,
  put,
  restoreSession,
  setToken,
} from './api';
import { Dashboard, DEFAULT_BACKTEST, defaultLayout } from './pages';
import type { BacktestForm } from './pages';
import { HistoryDialog, Modal, PortfolioDialog, RenameDialog } from './PortfolioDialog';
import Studio from './Studio';
import StudioSelect from './StudioSelect';
import Subscription from './Subscription';
import Landing from './Landing';
import Account from './Account';
import AccountMenu from './AccountMenu';
import { defaultPreferences, pageAppearanceStyle, readPreferences } from './preferences';
import type { Preferences } from './preferences';
import type {
  Analysis,
  AnalysisRules,
  Backtest,
  Instrument,
  Layout,
  LiveGrowth,
  Page,
  Point,
  Portfolio,
  User,
  Version,
} from './types';

type Route = Page | 'subscription' | 'account';
const DEFAULT_ANALYSIS_RULES: AnalysisRules = { benchmarkPortfolioId: '', riskFreeRate: 0.02, shortWindow: 20, longWindow: 50 };
const NAV = [
  { id: 'portfolio', label: 'Portfolio', icon: LayoutDashboard },
  { id: 'risk', label: 'Risk', icon: ShieldCheck },
  { id: 'signals', label: 'Signals', icon: TrendingUp },
  { id: 'backtest', label: 'Backtest', icon: FlaskConical },
  { id: 'factors', label: 'Factors', icon: Layers3 },
  { id: 'subscription', label: 'Plans', icon: CreditCard },
] as const;
const INTRO: Record<Page, { eyebrow: string; title: string; description: string }> = {
  portfolio: {
    eyebrow: 'ANALYSIS',
    title: 'Know your portfolio,\nsee the full picture.',
    description: 'A clear view of your performance, allocation, and cumulative growth.',
  },
  risk: {
    eyebrow: 'PORTFOLIO ANALYTICS',
    title: 'Risk, from every angle.',
    description: 'Explore volatility, drawdown, and the relationships between your assets.',
  },
  signals: {
    eyebrow: 'PORTFOLIO ANALYTICS',
    title: 'Signals give context, not instructions.',
    description:
      'Compare short-term moving averages with long-term trends to describe historical states.',
  },
  backtest: {
    eyebrow: 'PORTFOLIO ANALYTICS',
    title: 'Backtest a simple rule.',
    description: 'See how a strategy responds to historical trends, costs, and volatility.',
  },
  factors: {
    eyebrow: 'PORTFOLIO ANALYTICS',
    title: 'Understand what drives returns.',
    description: 'Explore market sensitivity and momentum across your assets.',
  },
};
const ROUTES = [
  { path: '/', id: 'landing' },
  { path: '/sign-in', id: 'login' },
  { path: '/sign-up', id: 'register' },
  ...NAV.map(({ id }) => ({ path: '/' + id, id })),
  { path: '/account', id: 'account' },
];
const PRIVATE_ROUTES = new Set<Route>([...NAV.map(({ id }) => id), 'account']);
const LEGACY_HASH_ROUTES = new Set(['sign-in', 'sign-up', ...PRIVATE_ROUTES]);
const localDate = (date: Date) =>
  date.getFullYear() +
  '-' +
  String(date.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(date.getDate()).padStart(2, '0');

export default function App() {
  useLanguage();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const routeId = matchRoutes(ROUTES, location)?.at(-1)?.route.id;
  const page: Route = PRIVATE_ROUTES.has(routeId as Route) ? (routeId as Route) : 'portfolio';
  const publicView =
    routeId === 'login' || routeId === 'register' || routeId === 'landing' ? routeId : null;
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [afterLogout, setAfterLogout] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [portfolioMenu, setPortfolioMenu] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [viewVersion, setViewVersion] = useState<Version | null>(null);
  const [period, setPeriod] = useState('1Y');
  const [liveSecondView, setLiveSecondView] = useState(false);
  const [intradayRange, setIntradayRange] = useState<IntradayRange | null>(null);
  const source = 'alpaca' as const;
  const [analysisRules, setAnalysisRules] = useState<AnalysisRules>({ ...DEFAULT_ANALYSIS_RULES });
  const [refresh, setRefresh] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [liveGrowth, setLiveGrowth] = useState<LiveGrowth | null>(null);
  const [liveSamples, setLiveSamples] = useState<Point[]>([]);
  useEffect(() => {
    const runId = analysis?.id;
    setLiveSamples([]);
    if (!runId || analysis?.result.metadata.source !== 'alpaca' || page !== 'portfolio') {
      setLiveGrowth(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<LiveGrowth>(`/analysis-runs/${runId}/live-growth`);
        if (!cancelled) {
          setLiveGrowth(result);
          if (result.point && result.as_of && Date.now() - Date.parse(result.as_of) < 30_000) {
            const sample: Point = {
              date: new Date().toISOString(),
              portfolio: result.point.portfolio,
              benchmark: result.point.benchmark,
            };
            setLiveSamples((current) => [...current, sample].slice(-120));
          }
        }
      } catch {
        if (!cancelled) setLiveGrowth(null);
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [analysis?.id, page]);
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisRef = useRef('');
  const portfolioRequest = useRef(0);
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [btForm, setBtForm] = useState<BacktestForm>({ ...DEFAULT_BACKTEST });
  const [btBusy, setBtBusy] = useState(false);
  const [btKey, setBtKey] = useState('');
  const backtestRequest = useRef(0);
  const [layouts, setLayouts] = useState<Partial<Record<Page, Layout>>>({});
  const [studio, setStudio] = useState(false);
  const [studioClosing, setStudioClosing] = useState(false);
  const studioCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (studioCloseTimer.current) clearTimeout(studioCloseTimer.current);
  }, []);
  function closeStudio() {
    if (studioClosing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStudio(false);
      return;
    }
    setStudioClosing(true);
    studioCloseTimer.current = setTimeout(() => {
      setStudio(false);
      setStudioClosing(false);
      studioCloseTimer.current = null;
    }, 280);
  }
  function openStudio() {
    setMobileMenu(false);
    setUserMenu(false);
    if (analysis && !loading) setStudio(true);
    else notify('Select a portfolio and complete an analysis to open Studio.');
  }
  const [preferences, setPreferences] = useState(defaultPreferences);
  useEffect(() => {
    setPreferences(user ? readPreferences(user.id) : defaultPreferences());
  }, [user?.id]);
  function savePreferences(value: Preferences) {
    setPreferences(value);
    if (user) {
      try {
        localStorage.setItem('dofiin:presentation:' + user.id, JSON.stringify(value));
      } catch {
        notify('Layout saved. Browser preferences could not be stored.');
      }
    }
  }
  const [dialog, setDialog] = useState<
    'create' | 'config' | 'rename' | 'history' | 'archive' | 'help' | 'optimize' | null
  >(null);
  const [optimization, setOptimization] = useState<{
    weights: { symbol: string; weight: string }[];
    estimated_sharpe: number | null;
    warning: string;
  } | null>(null);
  const [optBusy, setOptBusy] = useState(false);
  const [optError, setOptError] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [toast, setToast] = useState('');

  function notify(message: string) {
    setToast(message);
  }
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const legacyRoute = window.location.hash.slice(1);
    if (location.pathname === '/' && LEGACY_HASH_ROUTES.has(legacyRoute)) {
      routerNavigate('/' + legacyRoute, { replace: true });
    }
  }, [location.pathname, routerNavigate]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    if (!user && location.pathname === '/' && afterLogout) setAfterLogout(false);
  }, [user, location.pathname, afterLogout]);
  function navigate(route: Route) {
    routerNavigate('/' + route);
    setMobileMenu(false);
    setPortfolioMenu(false);
  }
  function report(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      setUser(null);
      setToken('');
    }
    notify(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
  }

  async function loadPortfolio(id: string) {
    if (portfolio?.id === id) {
      if (analysis?.portfolio_version_id === portfolio.latest_version.id) setLoading(false);
      return;
    }
    const request = ++portfolioRequest.current;
    setLoading(true);
    if (!studio) setAnalysis(null);
    setBacktest(null);
    setViewVersion(null);
    setAnalysisError('');
    try {
      const result = await api<Portfolio>('/portfolios/' + id);
      if (request !== portfolioRequest.current) return;
      setPortfolio(result);
      setBtForm((current) => ({ ...current, initial_capital: Number(result.latest_version.initial_capital) }));
      localStorage.setItem('dofiin-portfolio', id);
    } catch (error) {
      if (request !== portfolioRequest.current) return;
      setLoading(false);
      report(error);
    }
  }
  async function signedIn() {
    const [me, assets] = await Promise.all([
      api<User>('/users/me'),
      api<Instrument[]>('/instruments'),
    ]);
    const list = await api<Portfolio[]>('/portfolios');
    setInstruments(assets);
    setPortfolios(list);
    setPeriod('1Y');
    const starterBenchmarkId = list.find((item) => item.profile_role === 'benchmark')?.id || '';
    setAnalysisRules({ ...DEFAULT_ANALYSIS_RULES, benchmarkPortfolioId: starterBenchmarkId });
    setBtForm({ ...DEFAULT_BACKTEST });
    try {
      const saved = JSON.parse(localStorage.getItem('dofiin:analysis-settings:' + me.id) || 'null');
      if (saved) {
        if (['1M', '3M', '6M', '1Y', '3Y'].includes(saved.period)) setPeriod(saved.period);
        const riskFreeRate = Number(saved.rules?.riskFreeRate);
        const shortWindow = Number(saved.rules?.shortWindow);
        const longWindow = Number(saved.rules?.longWindow);
        const benchmarkPortfolioId = list.some((item) => item.id === saved.rules?.benchmarkPortfolioId)
          ? saved.rules.benchmarkPortfolioId : starterBenchmarkId;
        if (Number.isFinite(riskFreeRate) && riskFreeRate >= 0 && riskFreeRate <= 0.2 && Number.isInteger(shortWindow) && shortWindow >= 2 && shortWindow <= 100 && Number.isInteger(longWindow) && longWindow >= 3 && longWindow <= 250 && shortWindow < longWindow)
          setAnalysisRules({ benchmarkPortfolioId, riskFreeRate, shortWindow, longWindow });
      }
    } catch { /* Ignore invalid local settings. */ }
    try {
      const saved = JSON.parse(localStorage.getItem('dofiin:backtest-settings:' + me.id) || 'null');
      if (saved && (saved.strategy === 'MA_CROSSOVER' || saved.strategy === 'BUY_AND_HOLD' || saved.strategy === 'REGIME_SWITCHING') && (saved.rebalance_frequency === 'MONTHLY' || saved.rebalance_frequency === 'NONE') && Number.isFinite(saved.initial_capital) && saved.initial_capital > 0 && saved.initial_capital <= 1e9 && Number.isFinite(saved.fee_bps) && saved.fee_bps >= 0 && saved.fee_bps <= 100 && Number.isFinite(saved.slippage_bps) && saved.slippage_bps >= 0 && saved.slippage_bps <= 100)
        setBtForm(saved);
    } catch { /* Ignore invalid local settings. */ }
    setUser(me);
    const selected =
      list.find((item) => item.id === localStorage.getItem('dofiin-portfolio')) || list.find((item) => item.profile_role === 'default') || list[0];
    if (selected) await loadPortfolio(selected.id);
    else {
      setPortfolio(null);
      setAnalysis(null);
    }
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if ((await restoreSession()) && active) await signedIn();
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) window.scrollTo({ top: 0 });
  }, [user?.id]);
  const benchmarkProfile = portfolios.find((item) => item.id === analysisRules.benchmarkPortfolioId && item.id !== portfolio?.id)
    || portfolios.find((item) => item.profile_role === 'benchmark' && item.id !== portfolio?.id)
    || portfolios.find((item) => item.id !== portfolio?.id);
  useEffect(() => {
    if (!portfolio || !benchmarkProfile || analysisRules.benchmarkPortfolioId === benchmarkProfile.id) return;
    setAnalysisRules((current) => ({ ...current, benchmarkPortfolioId: benchmarkProfile.id }));
  }, [portfolio?.id, benchmarkProfile?.id, analysisRules.benchmarkPortfolioId]);
  const versionId = viewVersion?.id || portfolio?.latest_version.id;
  useEffect(() => {
    if (!user || !versionId) return;
    let active = true;
    setLoading(true);
    if (analysis?.portfolio_version_id !== versionId) {
      if (!studio) setAnalysis(null);
      setBacktest(null);
    }
    setAnalysisError('');
    analysisRef.current = '';
    const end = new Date();
    const start = new Date(end);
    start.setDate(
      start.getDate() - ({ '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095 }[period] || 365),
    );
    const requestedStart = localDate(start);
    post<Analysis>('/analysis-runs', {
      portfolio_version_id: versionId,
      benchmark_portfolio_id: benchmarkProfile?.id,
      source,
      start_date: requestedStart,
      end_date: localDate(end),
      risk_free_rate: analysisRules.riskFreeRate,
      short_window: analysisRules.shortWindow,
      long_window: analysisRules.longWindow,
    })
      .then((result) => {
        if (active) {
          analysisRef.current = result.id;
          setAnalysis(result);
          setBacktest(null);
        }
      })
      .catch((error) => {
        if (active) {
          setAnalysisError(error instanceof Error ? error.message : 'Unable to run analysis.');
          if (error instanceof ApiError && error.status === 401) setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, versionId, period, source, benchmarkProfile?.id, analysisRules.riskFreeRate, analysisRules.shortWindow, analysisRules.longWindow, refresh]);
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem('dofiin:analysis-settings:' + user.id, JSON.stringify({ period, source, rules: analysisRules }));
    } catch { /* Analysis settings still work for this session. */ }
  }, [user?.id, period, source, analysisRules]);
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem('dofiin:backtest-settings:' + user.id, JSON.stringify(btForm));
    } catch { /* Backtest settings still work for this session. */ }
  }, [user?.id, btForm]);

  useEffect(() => {
    if (!user || page === 'subscription' || page === 'account') return;
    let active = true;
    api<Layout>('/layouts/' + page)
      .then((result) => {
        if (active) setLayouts((previous) => ({ ...previous, [page]: result }));
      })
      .catch(report);
    return () => {
      active = false;
    };
  }, [user?.id, page]);
  async function runBacktest(form = btForm) {
    if (!analysis) return;
    const request = ++backtestRequest.current;
    setBtBusy(true);
    const runId = analysis.id;
    const formKey = JSON.stringify(form);
    try {
      const result = await post<Backtest>('/backtest-runs', { analysis_run_id: runId, ...form });
      if (request === backtestRequest.current && analysisRef.current === runId) {
        setBacktest(result);
        setBtKey(formKey);
      }
    } catch (error) {
      if (request === backtestRequest.current) report(error);
    } finally {
      if (request === backtestRequest.current) setBtBusy(false);
    }
  }
  useEffect(() => {
    if (page === 'backtest' && analysis && !backtest) void runBacktest();
  }, [page, analysis?.id]);

  async function savedPortfolio(result: Portfolio) {
    portfolioRequest.current += 1;
    setPortfolios(await api<Portfolio[]>('/portfolios'));
    setPortfolio(result);
    setBtForm((current) => ({ ...current, initial_capital: Number(result.latest_version.initial_capital) }));
    setViewVersion(null);
    localStorage.setItem('dofiin-portfolio', result.id);
    notify('Portfolio saved · Version' + result.current_version);
  }
  async function archive() {
    if (!portfolio) return;
    setArchiveBusy(true);
    try {
      await post('/portfolios/' + portfolio.id + '/archive', {});
      const list = await api<Portfolio[]>('/portfolios');
      setPortfolios(list);
      setPortfolio(null);
      setAnalysis(null);
      setDialog(null);
      if (list.length) await loadPortfolio(list[0].id);
      notify('Portfolio archived. Its history has been preserved.');
    } catch (error) {
      report(error);
    } finally {
      setArchiveBusy(false);
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      report(error);
      return;
    }
    setAfterLogout(true);
    routerNavigate('/', { replace: true });
    setToken('');
    setUser(null);
    setPortfolio(null);
    setPortfolios([]);
    setAnalysis(null);
    setLayouts({});
    setUserMenu(false);
    setViewVersion(null);
  }
  async function optimize() {
    if (!analysis) return;
    setDialog('optimize');
    setOptBusy(true);
    setOptError('');
    setOptimization(null);
    try {
      setOptimization(
        await post('/analysis-runs/' + analysis.id + '/optimize', {
          max_weight: analysis.result.factors.length === 1 ? 1 : 0.8,
        }),
      );
    } catch (error) {
      setOptError(error instanceof Error ? error.message : 'Unable to optimize.');
    } finally {
      setOptBusy(false);
    }
  }
  async function applyOptimization() {
    if (!portfolio || !optimization) return;
    setOptBusy(true);
    setOptError('');
    try {
      const allocations = optimization.weights
        .filter((item) => Number(item.weight) > 0)
        .map((item) => ({
          instrument_id: (viewVersion || portfolio.latest_version).allocations.find((asset) => asset.symbol === item.symbol)?.instrument_id
            || instruments.find((asset) => asset.symbol === item.symbol)!.id,
          weight: item.weight,
        }));
      const result = await put<Portfolio>('/portfolios/' + portfolio.id + '/configuration', {
        expected_version: portfolio.current_version,
        allocations,
      });
      await savedPortfolio(result);
      setDialog(null);
    } catch (error) {
      setOptError(error instanceof Error ? error.message : 'Unable to save weights.');
    } finally {
      setOptBusy(false);
    }
  }
  function exportCsv() {
    if (!analysis) return;
    const isBacktest = page === 'backtest' && backtest;
    const rows = isBacktest ? backtest.result.series : analysis.result.series;
    const keys = isBacktest
      ? ['date', 'strategy', 'benchmark', 'drawdown']
      : [
          'date',
          'portfolio',
          'benchmark',
          'drawdown',
          'volatility',
          'rolling_beta',
          'ma_short',
          'ma_long',
        ];
    const lines = [
      ['source', analysis.result.metadata.source].join(','),
      keys.join(','),
      ...rows.map((row) => keys.map((key) => row[key] ?? '').join(',')),
    ];
    if (isBacktest) {
      lines.push(
        '',
        'trade_date,action,turnover,cost',
        ...backtest.result.trades.map((t) => [t.date, t.action, t.turnover, t.cost].join(',')),
      );
    }
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dofiin-' + page + '-' + analysis.result.metadata.last_date + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    notify('CSV exported with its data source.');
  }

  if (booting)
    return (
      <div className="boot-screen">
        <BrandHome />
        <LoaderCircle className="spin" size={25} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!routeId) return <Navigate to={user ? '/portfolio' : '/'} replace />;
  if (user && publicView && publicView !== 'landing')
    return <Navigate to="/portfolio" replace />;
  if (!user && !publicView)
    return afterLogout ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
    );
  if (publicView === 'landing')
    return (
      <Landing
        user={user}
        onSignIn={() => routerNavigate(user ? '/portfolio' : '/sign-in')}
        onStart={() => routerNavigate(user ? '/portfolio' : '/sign-up')}
        onExplore={() => routerNavigate(user ? '/portfolio' : '/sign-in')}
        onAccount={() => navigate('account')}
        onSignOut={() => void logout()}
      />
    );
  if (!user)
    return (
      <Auth
        key={publicView}
        initialMode={publicView === 'register' ? 'register' : 'login'}
        onModeChange={(mode) => routerNavigate(mode === 'register' ? '/sign-up' : '/sign-in')}
        onSigned={async () => {
          await signedIn();
          const from = (location.state as { from?: unknown } | null)?.from;
          const match = typeof from === 'string' ? matchRoutes(ROUTES, from) : null;
          const destination = match?.at(-1)?.route.id;
          routerNavigate(
            destination && PRIVATE_ROUTES.has(destination as Route)
              ? (from as string)
              : '/portfolio',
            { replace: true },
          );
        }}
      />
    );
  const activePage = page === 'subscription' || page === 'account' ? 'portfolio' : page;
  const layout = layouts[activePage] || { revision: 0, config: defaultLayout(activePage) };
  const intro = INTRO[activePage];
  const pageContent = preferences.content[activePage]?.[preferences.locale];
  const visibleNav = preferences.menu.map((id) => NAV.find((item) => item.id === id)!);
  const analysisControls = (
    <div className="filter-bar">
      <div className="portfolio-selector">
        <span className="filter-caption">PORTFOLIO</span>
        <StudioSelect
          label="Select portfolio"
          value={portfolio?.id || ''}
          placeholder="Select portfolio"
          options={portfolios.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(id) => void loadPortfolio(id)}
        />
        <div className="portfolio-menu-wrap">
          <button
            className="icon-button"
            aria-label="Manage portfolios"
            onClick={() => setPortfolioMenu(!portfolioMenu)}
          >
            <MoreHorizontal size={18} />
          </button>
          {portfolioMenu && (
            <div className="dropdown portfolio-dropdown">
              <button
                onClick={() => {
                  setDialog('create');
                  setPortfolioMenu(false);
                }}
              >
                <Plus size={15} />
                Create portfolio
              </button>
              {portfolio && (
                <>
                  <button
                    onClick={() => {
                      setDialog('rename');
                      setPortfolioMenu(false);
                    }}
                  >
                    <Pencil size={15} />
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setDialog('history');
                      setPortfolioMenu(false);
                    }}
                  >
                    <Clock3 size={15} />
                    Version history
                  </button>
                  <button
                    className="danger-text"
                    onClick={() => {
                      setDialog('archive');
                      setPortfolioMenu(false);
                    }}
                  >
                    <Archive size={15} />
                    Archive portfolio
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="period-selector" role="group" aria-label="Chart time window">
        {activePage === 'portfolio' && (
          <button
            className={liveSecondView ? 'active' : ''}
            aria-label="Live chart, one-second updates"
            aria-pressed={liveSecondView}
            onClick={() => { setIntradayRange(null); setLiveSecondView(true); }}
          >
            1s
          </button>
        )}
        {activePage === 'portfolio' && INTRADAY_RANGES.map(({ value, label }) => (
          <button key={value} className={intradayRange === value ? 'active' : ''}
            aria-label={`Chart window: ${label}`} aria-pressed={intradayRange === value}
            title={`${label} ending at latest available minute bar`}
            onClick={() => { setLiveSecondView(false); setIntradayRange(value); }}>
            {value}
          </button>
        ))}
        {[
          ['1M', '1M'],
          ['3M', '3M'],
          ['6M', '6M'],
          ['1Y', '1Y'],
          ['3Y', '3Y'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={((!liveSecondView && !intradayRange) || activePage !== 'portfolio') && period === value ? 'active' : ''}
            aria-label={
              value.endsWith('M') ? value.slice(0, -1) + ' months' : value.slice(0, -1) + ' years'
            }
            onClick={() => { setLiveSecondView(false); setIntradayRange(null); setPeriod(value); }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="filter-end">
        <span className="source-selector" aria-label="Data source: Alpaca IEX">
          <i className="live-dot" /> Alpaca · IEX
        </span>
        <button
          className="icon-button"
          disabled={loading || !portfolio}
          aria-label="Refresh analysis"
          onClick={() => setRefresh(refresh + 1)}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
        <button
          className="icon-button"
          disabled={!analysis || loading}
          aria-label="Export CSV"
          onClick={exportCsv}
        >
          <Download size={16} />
        </button>
      </div>
    </div>
  );
  return (
    <div className={'app-shell route-' + page + (sidebarCollapsed ? ' menu-collapsed' : '')}>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside id="main-sidebar" inert={!!dialog || studio || (sidebarCollapsed && !mobileMenu)} className={'sidebar ' + (mobileMenu ? 'open' : '')}>
        <div className="sidebar-brand">
          <BrandHome light onClick={() => setMobileMenu(false)} />
          <button
            className="mobile-only icon-button"
            aria-label="Close menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <span className="sidebar-eyebrow">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {visibleNav.map((item) => (
            <NavLink
              key={item.id}
              to={'/' + item.id}
              className={'nav-item ' + (page === item.id ? 'active' : '')}
              onClick={() => {
                setMobileMenu(false);
                setPortfolioMenu(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {page === item.id && <i />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <i />
            Alpaca · IEX
          </div>
          <button className="sidebar-user" onClick={() => setUserMenu(!userMenu)}>
            <span className="avatar">{user.display_name.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{user.display_name}</strong>
              <small>Personal account</small>
            </span>
            <ChevronDown size={14} />
          </button>
          {userMenu && (
            <div className="user-menu">
              <span>{user.email}</span>
              <button
                onClick={() => {
                  navigate('account');
                  setUserMenu(false);
                }}
              >
                Account
              </button>
              <button onClick={() => void logout()}>
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="app-main" inert={!!dialog || studio}>
        <header className="topbar">
          <div className="topbar-brand">
            <BrandHome />
          </div>
          <div className="topbar-breadcrumb">
            <button
              className="icon-button desktop-menu-toggle"
              aria-label={sidebarCollapsed ? 'Open menu' : 'Close menu'}
              aria-controls="main-sidebar"
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={24} /> : <PanelLeftClose size={24} />}
            </button>
            <button
              className="icon-button mobile-only"
              aria-label="Open menu"
              aria-controls="main-sidebar"
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-home">Portfolio analytics</span>
            <span>/</span>
            <strong>
              {page === 'portfolio'
                ? 'Portfolio overview'
                : page === 'account'
                  ? 'Account'
                  : NAV.find((item) => item.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <LanguageSelect />
            {!studio && page !== 'subscription' && page !== 'account' && (
              <StudioModeSwitch checked={false} onToggle={openStudio} />
            )}
            <AccountMenu user={user} onAccount={() => navigate('account')} onSignOut={() => void logout()} />
          </div>
        </header>
        <main className="main-content" style={page !== 'account' && page !== 'subscription' ? pageAppearanceStyle(preferences.pageAppearance?.[activePage]) : undefined}>
          {page === 'subscription' ? (
            <Subscription notify={notify} />
          ) : page === 'account' ? (
            <Account
              user={user}
              portfolioCount={portfolios.length}
              onPlans={() => navigate('subscription')}
              onSignOut={() => void logout()}
            />
          ) : (
            <>
              <div className="page-intro">
                <div>
                  <span className="eyebrow">
                    {intro.eyebrow}
                    {page === 'portfolio' ? ' · ' + period : ''}
                  </span>
                  <h1>
                    {(pageContent?.title ?? intro.title).split('\n').map((line, i) => (
                      <span key={line}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </h1>
                  <p>
                    {pageContent?.description ?? (page === 'portfolio' && analysis
                      ? `Your portfolio ${(analysis.result.metrics.excess_return ?? 0) >= 0 ? 'beat' : 'trailed'} ${analysis.result.metadata.benchmark} by ${number(Math.abs(analysis.result.metrics.excess_return ?? 0) * 100, 1)} pp. ${[...analysis.result.factors].sort((a, b) => b.weight - a.weight)[0]?.symbol ?? '—'} has the largest weight (${percent(Math.max(...analysis.result.factors.map((f) => f.weight)), 0)}).`
                      : intro.description)}
                  </p>
                </div>
              </div>
              {(!analysis || loading || analysisError) && analysisControls}
              {viewVersion && (
                <div className="version-notice">
                  <Clock3 size={15} />
                  Viewing version {viewVersion.version_number}. Current configuration is version{' '}
                  {portfolio?.current_version}.
                  <button className="text-button" onClick={() => setViewVersion(null)}>
                    Back to current →
                  </button>
                </div>
              )}
              {analysisError && (
                <div className="data-error" role="alert">
                  <CircleHelp size={22} />
                  <div>
                    <strong>Analysis could not be completed.</strong>
                    <p>{analysisError}</p>
                    <div>
                      <button
                        className="button outline small"
                        onClick={() => setRefresh(refresh + 1)}
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {!portfolio ? (
                <div className="empty-state">
                  <span className="empty-icon">
                    <ChartNoAxesCombined size={34} />
                  </span>
                  <span className="eyebrow">START HERE</span>
                  <h2>One portfolio. More perspective.</h2>
                  <p>Choose your assets, set your weights, and explore the results.</p>
                  <button className="button primary" onClick={() => setDialog('create')}>
                    <Plus size={16} />
                    Create your first portfolio
                  </button>
                </div>
              ) : loading ? (
                <div className="dashboard-skeleton" aria-live="polite">
                  <div className="loading-copy">
                    <LoaderCircle className="spin" size={17} />
                    Fetching historical prices from Alpaca IEX…
                  </div>
                  <div className="skeleton-metrics">
                    {[0, 1, 2, 3].map((i) => (
                      <div className="skeleton" key={i} />
                    ))}
                  </div>
                  <div className="skeleton-charts">
                    <div className="skeleton" />
                    <div className="skeleton" />
                  </div>
                </div>
              ) : analysis ? (
                <>
                {activePage === 'portfolio' && intradayRange && <p className="intraday-scope" role="status">Chart window: {intradayRange}. Return, volatility and Sharpe above remain based on the {period} daily analysis. 1p / 15p / 30p mean minutes; 1d / 3d mean calendar days ending at the latest available bar.</p>}
                <Dashboard
                  presentation={preferences.presentation}
                  sectionAppearance={preferences.sectionAppearance[activePage]}
                  controls={analysisControls}
                  page={activePage}
                  analysis={analysis}
                  liveGrowth={liveGrowth}
                  liveSecondView={liveSecondView}
                  intradayRange={intradayRange}
                  liveSamples={liveSamples}
                  portfolioVersion={viewVersion || portfolio?.latest_version}
                  layout={layout.config}
                  backtest={backtest}
                  btBusy={btBusy}
                  btForm={btForm}
                  setBtForm={setBtForm}
                  onBacktest={() => void runBacktest()}
                  onOptimize={() => void optimize()}
                  btStale={!!backtest && btKey !== JSON.stringify(btForm)}
                />
                </>
              ) : null}
              {analysis && !loading && (
                <div className="analysis-provenance">
                  <div>
                    <span
                      className={
                        'provenance-dot ' + (analysis.result.metadata.is_demo ? 'demo' : '')
                      }
                    />
                    <span>
                      {analysis.result.metadata.is_demo
                        ? 'Simulated data'
                        : analysis.result.metadata.source === 'alpaca' ? 'Alpaca · IEX' : 'Source: Yahoo Finance'}{' '}
                      · {dateLabel(analysis.result.metadata.last_date)} ·{' '}
                      {analysis.result.metadata.observations} sessions
                    </span>
                  </div>
                  <span>
                    Version {analysis.result.metadata.version_number} · USD · 252 sessions / year
                  </span>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              doFiin<span> / </span>Portfolio clarity, without the noise.
            </span>
            <span>Research and historical analysis · Illustrative data</span>
          </footer>
        </main>
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          {visibleNav.map((item) => (
              <NavLink
                className={page === item.id ? 'active' : ''}
                key={item.id}
                to={'/' + item.id}
                onClick={() => setMobileMenu(false)}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            ))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {(dialog === 'create' || dialog === 'config') && (
        <PortfolioDialog
          portfolio={dialog === 'config' ? portfolio : null}
          instruments={instruments}
          onSaved={savedPortfolio}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'rename' && portfolio && (
        <RenameDialog
          portfolio={portfolio}
          onSaved={savedPortfolio}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'history' && portfolio && (
        <HistoryDialog
          portfolio={portfolio}
          onView={(version) => {
            setViewVersion(version);
            setBtForm((current) => ({ ...current, initial_capital: Number(version.initial_capital) }));
            notify('Analyzing version' + version.version_number);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'archive' && portfolio && (
        <Modal title="Archive portfolio?" subtitle={portfolio.name} onClose={() => setDialog(null)}>
          <p>
            The portfolio will be hidden from your active list. Its configuration and analysis
            history will be preserved.
          </p>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setDialog(null)}>
              Keep portfolio
            </button>
            <button className="button danger" disabled={archiveBusy} onClick={() => void archive()}>
              {archiveBusy ? <LoaderCircle className="spin" size={15} /> : <Archive size={15} />}
              Archive
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'help' && (
        <Modal
          title="Understand your portfolio from every angle."
          subtitle="A few concepts to get you started."
          onClose={() => setDialog(null)}
        >
          <div className="help-grid">
            {[
              [
                'Return',
                'Gain or loss over the selected period. An initial index of 100 makes growth comparable.',
              ],
              [
                `Benchmark ${analysis?.result.metadata.benchmark || benchmarkProfile?.name || '—'}`,
                'The benchmark profile and active portfolio use the same price data source for comparison.',
              ],
              [
                'Drawdown',
                'Decline from a previous peak. It does not predict maximum future losses.',
              ],
              [
                'Sharpe ratio',
                'Return above the risk-free rate divided by volatility. The current model uses a 2% annual risk-free rate.',
              ],
              [
                'Backtest',
                'Historical strategy simulation with explicit execution, fee, and slippage assumptions.',
              ],
              [
                'Data source',
                'Alpaca IEX provides historical prices and live trades for this demo. Live prices may differ from the consolidated US market.',
              ],
            ].map(([title, text]) => (
              <div key={title}>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <button className="button primary full" onClick={() => setDialog(null)}>
            Got it
            <ArrowRight size={15} />
          </button>
        </Modal>
      )}
      {dialog === 'optimize' && (
        <Modal
          title="View simulation"
          subtitle="Explore allocations using historical returns and covariance."
          onClose={() => setDialog(null)}
        >
          {optBusy ? (
            <div className="empty-chart">
              <LoaderCircle className="spin" size={26} />
              <p>Calculating…</p>
            </div>
          ) : optimization ? (
            <>
              <div className="optimization-summary">
                <Sparkles size={21} />
                <span>
                  Estimated Sharpe ratio
                  <strong>{number(optimization.estimated_sharpe)}</strong>
                </span>
              </div>
              <div className="optimization-weights">
                {optimization.weights.map((item) => (
                  <div key={item.symbol}>
                    <strong>{item.symbol}</strong>
                    <span>{percent(Number(item.weight), 2)}</span>
                  </div>
                ))}
              </div>
              <p className="small-note">
                {optimization.warning} Maximum per asset:{' '}
                {optimization.weights.length === 1 ? '100%' : '80%'}. Saving creates a new version
                and preserves your history.
              </p>
              <div className="modal-actions">
                <button className="button outline" onClick={() => setDialog(null)}>
                  Close
                </button>
                <button
                  className="button primary"
                  disabled={optBusy}
                  onClick={() => void applyOptimization()}
                >
                  Save as new version
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          ) : null}
          {optError && <div className="inline-error">{optError}</div>}
        </Modal>
      )}
      {studio && analysis && (
        <Studio
          closing={studioClosing}
          preferences={preferences}
          onPreferencesSaved={savePreferences}
          page={activePage}
          analysis={analysis}
          liveGrowth={liveGrowth}
          liveSecondView={liveSecondView}
                  intradayRange={intradayRange}
          liveSamples={liveSamples}
          backtest={backtest}
          layout={layout}
          btForm={btForm}
          period={period}
          source={source}
          analysisRules={analysisRules}
          onAnalysisSettingsSaved={(nextPeriod, _nextSource, nextRules) => {
            setPeriod(nextPeriod);
            setAnalysisRules(nextRules);
          }}
          onBacktestSettingsSaved={(form, analysisWillRerun) => {
            setBtForm(form);
            if (!analysisWillRerun) void runBacktest(form);
          }}
          portfolio={portfolio}
          portfolios={portfolios}
          instruments={instruments}
          portfolioLoading={loading}
          onPortfolioChange={(id) => void loadPortfolio(id)}
          onPortfolioSaved={savedPortfolio}
          onOpenHelp={() => {
            setStudio(false);
            setDialog('help');
          }}
          onClose={closeStudio}
          onPageChange={(nextPage) => navigate(nextPage)}
          defaultContent={INTRO[activePage]}
          onSaved={(result) => {
            setLayouts((previous) => ({ ...previous, [activePage]: result }));
            notify('Studio layout saved to your account.');
          }}
        />
      )}
    </div>
  );
}
