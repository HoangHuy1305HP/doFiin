import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
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
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import Auth, { Brand } from './Auth';
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
import Subscription from './Subscription';
import type {
  Analysis,
  Backtest,
  Instrument,
  Layout,
  Page,
  Portfolio,
  User,
  Version,
} from './types';

type Route = Page | 'subscription';
const NAV = [
  { id: 'portfolio', label: 'Danh mục', icon: LayoutDashboard },
  { id: 'risk', label: 'Rủi ro', icon: ShieldCheck },
  { id: 'signals', label: 'Tín hiệu', icon: TrendingUp },
  { id: 'backtest', label: 'Kiểm thử', icon: FlaskConical },
  { id: 'factors', label: 'Yếu tố', icon: Layers3 },
  { id: 'subscription', label: 'Gói dịch vụ', icon: CreditCard },
] as const;
const INTRO: Record<Page, { eyebrow: string; title: string; description: string }> = {
  portfolio: {
    eyebrow: 'DANH MỤC CỦA BẠN',
    title: 'Hiểu danh mục của bạn,\nbắt đầu từ tổng thể.',
    description: 'Một góc nhìn rõ ràng về hiệu suất, phân bổ và hành trình tích lũy.',
  },
  risk: {
    eyebrow: 'PHÂN TÍCH RỦI RO',
    title: 'Rủi ro, nhìn từ nhiều góc.',
    description: 'Đặt biến động, mức giảm từ đỉnh và tương quan vào cùng một bức tranh.',
  },
  signals: {
    eyebrow: 'BỐI CẢNH THỊ TRƯỜNG',
    title: 'Tín hiệu là bối cảnh,\nkhông phải chỉ dẫn.',
    description: 'Theo dõi xu hướng với những quy tắc đơn giản và minh bạch.',
  },
  backtest: {
    eyebrow: 'KIỂM THỬ CHIẾN LƯỢC',
    title: 'Kiểm thử một quy tắc,\ntrước khi đặt niềm tin.',
    description: 'Mô phỏng quá khứ để nhìn rõ hiệu suất, chi phí và những đánh đổi.',
  },
  factors: {
    eyebrow: 'PHÂN TÍCH YẾU TỐ',
    title: 'Hiểu động lực\nphía sau lợi nhuận.',
    description: 'Nhìn sâu hơn vào độ nhạy thị trường và động lượng của từng tài sản.',
  },
};
const readRoute = (): Route =>
  NAV.some((n) => n.id === location.hash.slice(1))
    ? (location.hash.slice(1) as Route)
    : 'portfolio';
const localDate = (date: Date) =>
  date.getFullYear() +
  '-' +
  String(date.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(date.getDate()).padStart(2, '0');

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Route>(readRoute);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [portfolioMenu, setPortfolioMenu] = useState(false);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [viewVersion, setViewVersion] = useState<Version | null>(null);
  const [period, setPeriod] = useState('1Y');
  const [source, setSource] = useState<'demo' | 'yahoo'>('demo');
  const [refresh, setRefresh] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisRef = useRef('');
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [btForm, setBtForm] = useState<BacktestForm>({ ...DEFAULT_BACKTEST });
  const [btBusy, setBtBusy] = useState(false);
  const [btKey, setBtKey] = useState('');
  const [layouts, setLayouts] = useState<Partial<Record<Page, Layout>>>({});
  const [studio, setStudio] = useState(false);
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
    const handler = () => setPage(readRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  function navigate(route: Route) {
    setPage(route);
    location.hash = route;
    setMobileMenu(false);
    setPortfolioMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function report(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      setUser(null);
      setToken('');
    }
    notify(error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
  }

  async function loadPortfolio(id: string) {
    setLoading(true);
    setAnalysis(null);
    setBacktest(null);
    setViewVersion(null);
    setAnalysisError('');
    try {
      const result = await api<Portfolio>('/portfolios/' + id);
      setPortfolio(result);
      localStorage.setItem('dofiin-portfolio', id);
    } catch (error) {
      setLoading(false);
      report(error);
    }
  }
  async function signedIn(demo = false) {
    const [me, assets] = await Promise.all([
      api<User>('/users/me'),
      api<Instrument[]>('/instruments'),
    ]);
    let list = await api<Portfolio[]>('/portfolios');
    if (demo && !list.length) {
      const allocations = [
        ['AAPL', '0.45'],
        ['MSFT', '0.35'],
        ['NVDA', '0.20'],
      ].map(([symbol, weight]) => ({
        instrument_id: assets.find((item) => item.symbol === symbol)!.id,
        weight,
      }));
      const created = await post<Portfolio>('/portfolios', {
        name: 'Danh mục dài hạn',
        description: 'Không gian trải nghiệm demo 1',
        allocations,
      });
      list = [created];
    }
    setInstruments(assets);
    setPortfolios(list);
    setUser(me);
    const selected =
      list.find((item) => item.id === localStorage.getItem('dofiin-portfolio')) || list[0];
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
  const versionId = viewVersion?.id || portfolio?.latest_version.id;
  useEffect(() => {
    if (!user || !versionId) return;
    let active = true;
    setLoading(true);
    setAnalysis(null);
    setBacktest(null);
    setAnalysisError('');
    analysisRef.current = '';
    const end = new Date();
    const start = new Date(end);
    start.setDate(
      start.getDate() - ({ '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095 }[period] || 365),
    );
    post<Analysis>('/analysis-runs', {
      portfolio_version_id: versionId,
      source,
      start_date: localDate(start),
      end_date: localDate(end),
    })
      .then((result) => {
        if (active) {
          analysisRef.current = result.id;
          setAnalysis(result);
        }
      })
      .catch((error) => {
        if (active) {
          setAnalysisError(error instanceof Error ? error.message : 'Không thể phân tích.');
          if (error instanceof ApiError && error.status === 401) setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, versionId, period, source, refresh]);

  useEffect(() => {
    if (!user || page === 'subscription') return;
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
  async function runBacktest() {
    if (!analysis || btBusy) return;
    setBtBusy(true);
    const runId = analysis.id;
    const formKey = JSON.stringify(btForm);
    try {
      const result = await post<Backtest>('/backtest-runs', { analysis_run_id: runId, ...btForm });
      if (analysisRef.current === runId) {
        setBacktest(result);
        setBtKey(formKey);
      }
    } catch (error) {
      report(error);
    } finally {
      setBtBusy(false);
    }
  }
  useEffect(() => {
    if (page === 'backtest' && analysis && !backtest) void runBacktest();
  }, [page, analysis?.id]);

  async function savedPortfolio(result: Portfolio) {
    setPortfolios(await api<Portfolio[]>('/portfolios'));
    setPortfolio(result);
    setViewVersion(null);
    localStorage.setItem('dofiin-portfolio', result.id);
    notify('Đã lưu danh mục · Phiên bản ' + result.current_version);
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
      notify('Đã lưu trữ danh mục. Lịch sử vẫn được giữ trong CSDL.');
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
      setOptError(error instanceof Error ? error.message : 'Không thể tối ưu.');
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
          instrument_id: instruments.find((asset) => asset.symbol === item.symbol)!.id,
          weight: item.weight,
        }));
      const result = await put<Portfolio>('/portfolios/' + portfolio.id + '/configuration', {
        expected_version: portfolio.current_version,
        allocations,
      });
      await savedPortfolio(result);
      setDialog(null);
    } catch (error) {
      setOptError(error instanceof Error ? error.message : 'Không thể lưu tỷ trọng.');
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
    notify('Đã xuất CSV kèm nhãn nguồn dữ liệu.');
  }

  if (booting)
    return (
      <div className="boot-screen">
        <Brand />
        <LoaderCircle className="spin" size={25} />
        <p>Đang mở không gian của bạn…</p>
      </div>
    );
  if (!user) return <Auth onSigned={signedIn} />;
  const activePage = page === 'subscription' ? 'portfolio' : page;
  const layout = layouts[activePage] || { revision: 0, config: defaultLayout(activePage) };
  const intro = INTRO[activePage];
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Đóng menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside inert={!!dialog || studio} className={'sidebar ' + (mobileMenu ? 'open' : '')}>
        <div className="sidebar-brand">
          <Brand light />
          <button
            className="mobile-only icon-button"
            aria-label="Đóng menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <span className="sidebar-eyebrow">KHÔNG GIAN ĐẦU TƯ</span>
        <nav aria-label="Điều hướng chính">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={'nav-item ' + (page === item.id ? 'active' : '')}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {page === item.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="studio-teaser"
            onClick={() => {
              if (analysis) setStudio(true);
              else notify('Chọn danh mục và hoàn tất phân tích để mở Studio.');
            }}
          >
            <span>
              <SlidersHorizontal size={16} />
              doFiin Studio
              <ArrowUpRight size={14} />
            </span>
            <p>Một góc nhìn mang dấu ấn của bạn.</p>
            <span className="studio-teaser-link">
              Tinh chỉnh bố cục
              <ArrowRight size={13} />
            </span>
          </button>
          <div className="sidebar-status">
            <i />
            Không gian demo 01
          </div>
          <button className="sidebar-user" onClick={() => setUserMenu(!userMenu)}>
            <span className="avatar">{user.display_name.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{user.display_name}</strong>
              <small>Nhà đầu tư cá nhân</small>
            </span>
            <ChevronDown size={14} />
          </button>
          {userMenu && (
            <div className="user-menu">
              <span>{user.email}</span>
              <button onClick={() => void logout()}>
                <LogOut size={15} />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>
      <div className="app-main" inert={!!dialog || studio}>
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Mở menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-home">Tài chính</span>
            <span>/</span>
            <strong>{NAV.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-demo">
              <i />
              Demo 01
            </span>
            <button
              className="icon-button"
              aria-label="Hướng dẫn sử dụng"
              onClick={() => setDialog('help')}
            >
              <CircleHelp size={18} />
            </button>
            <span className="topbar-avatar">{user.display_name.charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <main className="main-content">
          {page === 'subscription' ? (
            <Subscription notify={notify} />
          ) : (
            <>
              <div className="page-intro">
                <div>
                  <span className="eyebrow">{intro.eyebrow}</span>
                  <h1>
                    {intro.title.split('\n').map((line, i) => (
                      <span key={line}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </h1>
                  <p>{intro.description}</p>
                </div>
                <div className="intro-actions">
                  <button
                    className="button outline"
                    disabled={!analysis || loading}
                    onClick={() => setStudio(true)}
                  >
                    <SlidersHorizontal size={15} />
                    Studio
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setDialog(portfolio ? 'config' : 'create')}
                  >
                    <Settings2 size={15} />
                    {portfolio ? 'Cấu hình danh mục' : 'Tạo danh mục'}
                  </button>
                </div>
              </div>
              <div className="filter-bar">
                <div className="portfolio-selector">
                  <span className="filter-caption">DANH MỤC</span>
                  <select
                    aria-label="Chọn danh mục"
                    value={portfolio?.id || ''}
                    onChange={(event) => void loadPortfolio(event.target.value)}
                  >
                    <option value="" disabled>
                      Chọn danh mục
                    </option>
                    {portfolios.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <div className="portfolio-menu-wrap">
                    <button
                      className="icon-button"
                      aria-label="Quản lý danh mục"
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
                          Tạo danh mục mới
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
                              Đổi tên
                            </button>
                            <button
                              onClick={() => {
                                setDialog('history');
                                setPortfolioMenu(false);
                              }}
                            >
                              <Clock3 size={15} />
                              Lịch sử cấu hình
                            </button>
                            <button
                              className="danger-text"
                              onClick={() => {
                                setDialog('archive');
                                setPortfolioMenu(false);
                              }}
                            >
                              <Archive size={15} />
                              Lưu trữ danh mục
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="period-selector">
                  {[
                    ['1M', '1T'],
                    ['3M', '3T'],
                    ['6M', '6T'],
                    ['1Y', '1N'],
                    ['3Y', '3N'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={period === value ? 'active' : ''}
                      aria-label={
                        value.endsWith('M')
                          ? value.slice(0, -1) + ' tháng'
                          : value.slice(0, -1) + ' năm'
                      }
                      onClick={() => setPeriod(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="filter-end">
                  <div className="source-selector">
                    <i className={source === 'demo' ? 'demo-dot' : 'live-dot'} />
                    <select
                      aria-label="Nguồn dữ liệu"
                      value={source}
                      onChange={(event) => setSource(event.target.value as 'demo' | 'yahoo')}
                    >
                      <option value="demo">Dữ liệu mô phỏng</option>
                      <option value="yahoo">Yahoo Finance</option>
                    </select>
                  </div>
                  <button
                    className="icon-button"
                    disabled={loading || !portfolio}
                    aria-label="Tính lại phân tích"
                    onClick={() => setRefresh(refresh + 1)}
                  >
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={!analysis || loading}
                    aria-label="Xuất CSV"
                    onClick={exportCsv}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
              {viewVersion && (
                <div className="version-notice">
                  <Clock3 size={15} />
                  Đang xem phiên bản {viewVersion.version_number}. Cấu hình hiện tại là phiên bản{' '}
                  {portfolio?.current_version}.
                  <button className="text-button" onClick={() => setViewVersion(null)}>
                    Về hiện tại →
                  </button>
                </div>
              )}
              {analysisError && (
                <div className="data-error" role="alert">
                  <CircleHelp size={22} />
                  <div>
                    <strong>Chưa thể hoàn tất phân tích.</strong>
                    <p>{analysisError}</p>
                    <div>
                      <button
                        className="button outline small"
                        onClick={() => setRefresh(refresh + 1)}
                      >
                        Thử lại
                      </button>
                      {source === 'yahoo' && (
                        <button className="button primary small" onClick={() => setSource('demo')}>
                          Chọn dữ liệu mô phỏng
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!portfolio ? (
                <div className="empty-state">
                  <span className="empty-icon">
                    <ChartNoAxesCombined size={34} />
                  </span>
                  <span className="eyebrow">BẮT ĐẦU TỪ ĐÂY</span>
                  <h2>Một danh mục, nhiều góc nhìn.</h2>
                  <p>Chọn tài sản, chia tỷ trọng và để dữ liệu kể phần còn lại.</p>
                  <button className="button primary" onClick={() => setDialog('create')}>
                    <Plus size={16} />
                    Tạo danh mục đầu tiên
                  </button>
                </div>
              ) : loading ? (
                <div className="dashboard-skeleton" aria-live="polite">
                  <div className="loading-copy">
                    <LoaderCircle className="spin" size={17} />
                    {source === 'yahoo'
                      ? 'Đang lấy giá lịch sử từ Yahoo Finance…'
                      : 'Đang tính toán góc nhìn của bạn…'}
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
                <Dashboard
                  page={activePage}
                  analysis={analysis}
                  layout={layout.config}
                  backtest={backtest}
                  btBusy={btBusy}
                  btForm={btForm}
                  setBtForm={setBtForm}
                  onBacktest={() => void runBacktest()}
                  onOptimize={() => void optimize()}
                  btStale={!!backtest && btKey !== JSON.stringify(btForm)}
                />
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
                        ? 'Dữ liệu mô phỏng'
                        : 'Nguồn: Yahoo Finance'}{' '}
                      · {dateLabel(analysis.result.metadata.last_date)} ·{' '}
                      {analysis.result.metadata.observations} phiên
                    </span>
                  </div>
                  <span>
                    Phiên bản {analysis.result.metadata.version_number} · USD · 252 phiên / năm
                  </span>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              doFiin<span> / </span>Góc nhìn rõ ràng, lựa chọn chủ động.
            </span>
            <span>Demo 01 · Phân tích, không phải khuyến nghị đầu tư</span>
          </footer>
        </main>
        <nav className="mobile-bottom-nav" aria-label="Điều hướng mobile">
          {NAV.slice(0, 5).map((item) => (
            <button
              className={page === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label="Đóng thông báo" onClick={() => setToast('')}>
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
            notify('Đang phân tích phiên bản ' + version.version_number);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'archive' && portfolio && (
        <Modal title="Lưu trữ danh mục?" subtitle={portfolio.name} onClose={() => setDialog(null)}>
          <p>
            Danh mục sẽ được ẩn khỏi danh sách đang hoạt động. Lịch sử cấu hình và kết quả phân tích
            vẫn được giữ trong cơ sở dữ liệu.
          </p>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setDialog(null)}>
              Giữ lại
            </button>
            <button className="button danger" disabled={archiveBusy} onClick={() => void archive()}>
              {archiveBusy ? <LoaderCircle className="spin" size={15} /> : <Archive size={15} />}Lưu
              trữ
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'help' && (
        <Modal
          title="Đọc danh mục theo từng góc nhìn."
          subtitle="Một vài khái niệm giúp bạn bắt đầu."
          onClose={() => setDialog(null)}
        >
          <div className="help-grid">
            {[
              [
                'Lợi nhuận',
                'Mức tăng hoặc giảm trong khoảng đã chọn. Chỉ số 100 đầu kỳ giúp so sánh hai đường tăng trưởng.',
              ],
              [
                'Benchmark SPY',
                'ETF tham chiếu cho thị trường cổ phiếu Mỹ; dùng cùng nguồn dữ liệu với danh mục.',
              ],
              [
                'Drawdown',
                'Mức giảm từ đỉnh đã đạt được. Không phải dự đoán khoản lỗ tối đa tương lai.',
              ],
              [
                'Sharpe ratio',
                'Lợi nhuận vượt lãi suất tham chiếu so với biến động. Demo dùng risk-free 2%/năm.',
              ],
              [
                'Backtest',
                'Mô phỏng một chiến lược trên dữ liệu quá khứ, có giả định khớp lệnh, phí và slippage.',
              ],
              [
                'Nguồn dữ liệu',
                'Dữ liệu mô phỏng để trình bày ổn định. Yahoo Finance cần kết nối mạng và có thể trả lỗi.',
              ],
            ].map(([title, text]) => (
              <div key={title}>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <button className="button primary full" onClick={() => setDialog(null)}>
            Đã hiểu
            <ArrowRight size={15} />
          </button>
        </Modal>
      )}
      {dialog === 'optimize' && (
        <Modal
          title="Thử tối ưu Sharpe"
          subtitle="Tìm phân bổ dựa trên lợi nhuận và hiệp phương sai trong quá khứ."
          onClose={() => setDialog(null)}
        >
          {optBusy ? (
            <div className="empty-chart">
              <LoaderCircle className="spin" size={26} />
              <p>Đang tính toán…</p>
            </div>
          ) : optimization ? (
            <>
              <div className="optimization-summary">
                <Sparkles size={21} />
                <span>
                  Sharpe ước lượng theo mô hình
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
                {optimization.warning} Trần mỗi tài sản:{' '}
                {optimization.weights.length === 1 ? '100%' : '80%'}. Lưu sẽ tạo phiên bản mới,
                không thay đổi lịch sử.
              </p>
              <div className="modal-actions">
                <button className="button outline" onClick={() => setDialog(null)}>
                  Đóng
                </button>
                <button
                  className="button primary"
                  disabled={optBusy}
                  onClick={() => void applyOptimization()}
                >
                  Lưu thành phiên bản mới
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
          page={activePage}
          analysis={analysis}
          backtest={backtest}
          layout={layout}
          btForm={btForm}
          onClose={() => setStudio(false)}
          onSaved={(result) => {
            setLayouts((previous) => ({ ...previous, [activePage]: result }));
            notify('Đã lưu bố cục Studio cho tài khoản của bạn.');
          }}
        />
      )}
    </div>
  );
}
