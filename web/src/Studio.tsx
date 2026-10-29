import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  GripVertical,
  LayoutTemplate,
  LoaderCircle,
  Monitor,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import { BrandHome } from './Auth';
import { PortfolioDialog, RenameDialog } from './PortfolioDialog';
import StudioModeSwitch from './StudioModeSwitch';
import StudioBackgroundPicker from './StudioBackgroundPicker';
import StudioSelect from './StudioSelect';
import { Dashboard, TITLES } from './pages';
import type { BacktestForm } from './pages';
import type { Analysis, AnalysisRules, Backtest, Instrument, Layout, LiveGrowth, Page, Point, Portfolio } from './types';
import { post, put } from './api';
import { DEFAULT_MENU, DEFAULT_PAGE_APPEARANCE, DEFAULT_SECTION_APPEARANCE, PAGE_LABELS, pageAppearanceStyle } from './preferences';
import type { PageAppearance, PageContent, Preferences, SectionAppearance } from './preferences';
import { useDialogFocus } from './useDialogFocus';

type Props = {
  closing: boolean;
  preferences: Preferences;
  onPreferencesSaved: (preferences: Preferences) => void;
  page: Page;
  analysis: Analysis;
  liveGrowth: LiveGrowth | null;
  liveSecondView: boolean;
  liveSamples: Point[];
  backtest: Backtest | null;
  layout: Layout;
  btForm: BacktestForm;
  period: string;
  source: 'demo' | 'yahoo' | 'alpaca';
  analysisRules: AnalysisRules;
  defaultContent: PageContent;
  onAnalysisSettingsSaved: (period: string, source: 'demo' | 'yahoo' | 'alpaca', rules: AnalysisRules) => void;
  onBacktestSettingsSaved: (form: BacktestForm, analysisWillRerun: boolean) => void;
  portfolio: Portfolio | null;
  portfolios: Portfolio[];
  instruments: Instrument[];
  portfolioLoading: boolean;
  onPortfolioChange: (id: string) => void;
  onPortfolioSaved: (portfolio: Portfolio) => Promise<void>;
  onOpenHelp: () => void;
  onPageChange: (page: Page) => void;
  onClose: () => void;
  onSaved: (layout: Layout) => void;
};
type InspectorTab = 'content' | 'design' | 'function';
type Viewport = 'desktop' | 'tablet' | 'mobile';
type ReorderKind = 'menu' | 'widget';
type DropPosition = 'before' | 'after';
function currentDeviceViewport(): Viewport {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth <= 760) return 'mobile';
  if (window.innerWidth < 1200) return 'tablet';
  return 'desktop';
}
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const FUNCTION_DESCRIPTIONS: Record<Page, string> = {
  portfolio: 'Choose the data behind this portfolio view and edit its purchase date, starting capital, holdings and weights.',
  risk: 'Choose the portfolio, date range and risk-free rate used by the risk analysis.',
  signals: 'Choose the portfolio and moving-average windows used by the signals.',
  backtest: 'Choose the portfolio, moving-average windows and simulation rules used by the backtest.',
  factors: 'Choose the portfolio, date range and risk-free rate used by factor analysis.',
};

export default function Studio({
  closing,
  preferences,
  onPreferencesSaved,
  page,
  analysis,
  liveGrowth,
  liveSecondView,
  liveSamples,
  backtest,
  layout,
  btForm,
  period,
  source,
  analysisRules,
  defaultContent,
  onAnalysisSettingsSaved,
  onBacktestSettingsSaved,
  portfolio,
  portfolios,
  instruments,
  portfolioLoading,
  onPortfolioChange,
  onPortfolioSaved,
  onOpenHelp,
  onPageChange,
  onClose,
  onSaved,
}: Props) {
  const [config, setConfig] = useState(() => structuredClone(layout.config));
  const [settings, setSettings] = useState(() => structuredClone(preferences));
  const [draftPeriod, setDraftPeriod] = useState(period);
  const [draftSource, setDraftSource] = useState(source);
  const [draftAnalysisRules, setDraftAnalysisRules] = useState<AnalysisRules>(() => ({ ...analysisRules }));
  const [draftBacktest, setDraftBacktest] = useState(() => ({ ...btForm }));
  const [selected, setSelected] = useState<string>('page');
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [sectionFocusRequest, setSectionFocusRequest] = useState<{ key: string; id: number } | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content');
  const [deviceViewport, setDeviceViewport] = useState<Viewport>(currentDeviceViewport);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const previewViewport = deviceViewport === 'desktop' ? viewport : deviceViewport;
  const [addingMenu, setAddingMenu] = useState(false);
  const [addingSections, setAddingSections] = useState(false);
  const [navigationExpanded, setNavigationExpanded] = useState(true);
  const [sectionsExpanded, setSectionsExpanded] = useState(true);
  const [dragging, setDragging] = useState<{ kind: ReorderKind; key: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    kind: ReorderKind;
    key: string;
    position: DropPosition;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [portfolioEditor, setPortfolioEditor] = useState<'create' | 'edit' | 'rename' | null>(null);
  const [previewAnalysis, setPreviewAnalysis] = useState<Analysis['result'] | null>(null);
  const [previewBacktest, setPreviewBacktest] = useState<Backtest['result'] | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const preservePreviewAfterSave = useRef(false);
  const previousAnalysisVersion = useRef(analysis.portfolio_version_id);
  const studioRef = useRef<HTMLDivElement>(null);
  const rowPositions = useRef(new Map<string, number>());
  const activePointer = useRef<{
    pointerId: number;
    kind: ReorderKind;
    key: string;
    startX: number;
    startY: number;
    active: boolean;
    target: { key: string; position: DropPosition } | null;
  } | null>(null);
  const incomingLayoutSignature = JSON.stringify(layout.config);
  const previousLayoutSignature = useRef(incomingLayoutSignature);
  const previousPage = useRef(page);
  useLayoutEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    previousLayoutSignature.current = incomingLayoutSignature;
    setConfig(structuredClone(layout.config));
    setSettings(structuredClone(preferences));
    setDraftPeriod(period);
    setDraftSource(source);
    setDraftAnalysisRules({ ...analysisRules });
    setDraftBacktest({ ...btForm });
    setSelected('page');
    setHighlightedSection(null);
    setSectionFocusRequest(null);
    setInspectorTab('content');
    setAddingMenu(false);
    setAddingSections(false);
    setSaved(false);
    setError('');
    setPreviewAnalysis(null);
    setPreviewBacktest(null);
    setPreviewPending(false);
    setPreviewError('');
    preservePreviewAfterSave.current = false;
    studioRef.current?.querySelector<HTMLElement>('.studio-preview-stage')?.scrollTo({ top: 0 });
    studioRef.current?.querySelector<HTMLElement>('.studio-right')?.scrollTo({ top: 0 });
  }, [page, incomingLayoutSignature, layout.config, preferences, period, source, analysisRules, btForm]);
  useEffect(() => {
    const updateDeviceViewport = () => setDeviceViewport(currentDeviceViewport());
    window.addEventListener('resize', updateDeviceViewport);
    return () => window.removeEventListener('resize', updateDeviceViewport);
  }, []);
  useEffect(() => {
    if (incomingLayoutSignature === previousLayoutSignature.current) return;
    const previousSignature = previousLayoutSignature.current;
    previousLayoutSignature.current = incomingLayoutSignature;
    setConfig((current) =>
      JSON.stringify(current) === previousSignature ? structuredClone(layout.config) : current,
    );
  }, [incomingLayoutSignature, layout.config]);
  useLayoutEffect(() => {
    if (!rowPositions.current.size) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rowPositions.current.clear();
      return;
    }
    for (const row of studioRef.current?.querySelectorAll<HTMLElement>('[data-reorder-key]') || []) {
      const id = `${row.dataset.reorderKind}:${row.dataset.reorderKey}`;
      const previousTop = rowPositions.current.get(id);
      if (previousTop === undefined) continue;
      const delta = previousTop - row.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) {
        row.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
          { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
      }
    }
    rowPositions.current.clear();
  }, [settings.menu, config.order]);
  useEffect(() => {
    if (!sectionFocusRequest) return;
    const stage = studioRef.current?.querySelector<HTMLElement>('.studio-preview-stage');
    const target = Array.from(stage?.querySelectorAll<HTMLElement>('[data-studio-section]') || [])
      .find((element) => element.dataset.studioSection === sectionFocusRequest.key);
    if (!stage || !target) return;
    const stageBounds = stage.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setHighlightedSection(sectionFocusRequest.key);
    stage.scrollTo({
      top: stage.scrollTop + targetBounds.top - stageBounds.top - 24,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    if (deviceViewport !== 'desktop')
      studioRef.current?.querySelector<HTMLElement>('.studio-body')?.scrollTo({
        top: 0,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    const timeout = window.setTimeout(() => setHighlightedSection(null), 500);
    return () => window.clearTimeout(timeout);
  }, [sectionFocusRequest]);
  const layoutChanged = JSON.stringify(config) !== JSON.stringify(layout.config);
  const preferencesChanged = JSON.stringify(settings) !== JSON.stringify(preferences);
  const analysisChanged = draftPeriod !== period || draftSource !== source || JSON.stringify(draftAnalysisRules) !== JSON.stringify(analysisRules);
  const benchmarkProfiles = portfolios.filter((item) => item.id !== portfolio?.id);
  const selectedBenchmarkProfile = benchmarkProfiles.find((item) => item.id === draftAnalysisRules.benchmarkPortfolioId)
    || benchmarkProfiles.find((item) => item.profile_role === 'benchmark')
    || benchmarkProfiles[0];
  useEffect(() => {
    if (!portfolio || !selectedBenchmarkProfile || draftAnalysisRules.benchmarkPortfolioId !== portfolio.id) return;
    setDraftAnalysisRules((current) => ({ ...current, benchmarkPortfolioId: selectedBenchmarkProfile.id }));
  }, [portfolio?.id, selectedBenchmarkProfile?.id, draftAnalysisRules.benchmarkPortfolioId]);
  const analysisRulesError = !Number.isFinite(draftAnalysisRules.riskFreeRate) || draftAnalysisRules.riskFreeRate < 0 || draftAnalysisRules.riskFreeRate > 0.2
    ? 'Risk-free rate must be between 0% and 20%.'
    : !selectedBenchmarkProfile
      ? 'Create another portfolio to use as a benchmark profile.'
    : !Number.isInteger(draftAnalysisRules.shortWindow) || draftAnalysisRules.shortWindow < 2 || draftAnalysisRules.shortWindow > 100
      ? 'Short moving-average window must be 2–100 sessions.'
      : !Number.isInteger(draftAnalysisRules.longWindow) || draftAnalysisRules.longWindow < 3 || draftAnalysisRules.longWindow > 250 || draftAnalysisRules.shortWindow >= draftAnalysisRules.longWindow
        ? 'Long moving-average window must be larger than the short window and at most 250 sessions.'
        : '';
  const backtestRulesError = page !== 'backtest' ? ''
    : !Number.isFinite(draftBacktest.initial_capital) || draftBacktest.initial_capital <= 0 || draftBacktest.initial_capital > 1e9
      ? 'Initial capital must be greater than $0 and at most $1,000,000,000.'
      : !Number.isFinite(draftBacktest.fee_bps) || draftBacktest.fee_bps < 0 || draftBacktest.fee_bps > 100 || !Number.isFinite(draftBacktest.slippage_bps) || draftBacktest.slippage_bps < 0 || draftBacktest.slippage_bps > 100
        ? 'Fees and slippage must each be between 0 and 100 bps.'
        : '';
  const backtestChanged = JSON.stringify(draftBacktest) !== JSON.stringify(btForm);
  const previewRulesKey = JSON.stringify(draftBacktest);
  const previewNeedsRun = analysisChanged || (page === 'backtest' && backtestChanged);
  const portfolioAnalysisReady = !portfolioLoading && !!portfolio && analysis.portfolio_version_id === portfolio.latest_version.id;
  useEffect(() => {
    if (previousAnalysisVersion.current === analysis.portfolio_version_id) return;
    previousAnalysisVersion.current = analysis.portfolio_version_id;
    setPreviewAnalysis(null);
    setPreviewBacktest(null);
    preservePreviewAfterSave.current = false;
  }, [analysis.portfolio_version_id]);
  useEffect(() => {
    if (!portfolioAnalysisReady) {
      setPreviewAnalysis(null);
      setPreviewBacktest(null);
      setPreviewPending(false);
      return;
    }
    if (analysisRulesError || backtestRulesError) {
      setPreviewPending(false);
      setPreviewError(analysisRulesError || backtestRulesError);
      return;
    }
    if (!previewNeedsRun) {
      setPreviewPending(false);
      setPreviewError('');
      if (!preservePreviewAfterSave.current) {
        setPreviewAnalysis(null);
        setPreviewBacktest(null);
      }
      return;
    }
    preservePreviewAfterSave.current = false;
    let active = true;
    setPreviewPending(true);
    setPreviewError('');
    const timer = window.setTimeout(async () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - ({ '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095 }[draftPeriod] || 365));
      const requestedStart = localDate(start);
      try {
        const result = await post<{
          analysis: Analysis['result'];
          backtest: Backtest['result'] | null;
        }>('/studio-preview', {
          analysis: {
            portfolio_version_id: analysis.portfolio_version_id,
            benchmark_portfolio_id: selectedBenchmarkProfile?.id,
            source: draftSource,
            start_date: requestedStart,
            end_date: localDate(end),
            risk_free_rate: draftAnalysisRules.riskFreeRate,
            short_window: draftAnalysisRules.shortWindow,
            long_window: draftAnalysisRules.longWindow,
          },
          backtest: page === 'backtest' ? draftBacktest : null,
        });
        if (!active) return;
        setPreviewAnalysis(result.analysis);
        setPreviewBacktest(result.backtest);
      } catch (reason) {
        if (active) setPreviewError(reason instanceof Error ? reason.message : 'Preview could not be updated.');
      } finally {
        if (active) setPreviewPending(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [analysis.portfolio_version_id, portfolio?.latest_version.purchase_date, portfolioAnalysisReady, page, draftPeriod, draftSource, selectedBenchmarkProfile?.id, draftAnalysisRules.riskFreeRate, draftAnalysisRules.shortWindow, draftAnalysisRules.longWindow, analysisRulesError, backtestRulesError, previewRulesKey, previewNeedsRun]);
  useEffect(() => {
    if (previewNeedsRun) return;
    preservePreviewAfterSave.current = false;
    setPreviewAnalysis(null);
    setPreviewBacktest(null);
  }, [analysis.id]);
  const changed = layoutChanged || preferencesChanged || analysisChanged || backtestChanged;
  const currentContent = settings.content[page]?.[settings.locale];
  const content = currentContent || defaultContent;
  const visibleSectionOrder = config.order.filter((key) => !config.hidden.includes(key));
  const isWidget = visibleSectionOrder.includes(selected);
  const isChartWidget = ['growth', 'drawdown', 'volatility', 'moving_average', 'backtest_growth', 'beta', 'momentum'].includes(selected);
  const hasChartStyle = ['growth', 'drawdown', 'volatility', 'backtest_growth'].includes(selected);
  const hasChartLegend = ['growth', 'volatility', 'moving_average', 'backtest_growth'].includes(selected);
  const sectionAppearance: SectionAppearance = {
    ...DEFAULT_SECTION_APPEARANCE,
    corners: settings.presentation.corners as SectionAppearance['corners'],
    ...settings.sectionAppearance[page]?.[selected],
  };
  const pageAppearance = { ...DEFAULT_PAGE_APPEARANCE, ...settings.pageAppearance?.[page] };
  const isMenu = selected.startsWith('menu:');
  const inspectorTitle =
    selected === 'page'
      ? `${PAGE_LABELS[page]} sections`
      : selected === 'theme'
        ? 'Theme settings'
        : isMenu
          ? PAGE_LABELS[selected.slice(5) as Page]
          : config.titles[selected] || TITLES[selected] || 'Widget';

  function updateContent(patch: Partial<PageContent>) {
    setSettings((previous) => ({
      ...previous,
      content: {
        ...previous.content,
        [page]: { ...previous.content[page], [previous.locale]: { ...content, ...patch } },
      },
    }));
    setSaved(false);
  }
  function updateSectionAppearance(patch: Partial<SectionAppearance>) {
    setSettings((previous) => ({
      ...previous,
      sectionAppearance: {
        ...previous.sectionAppearance,
        [page]: {
          ...previous.sectionAppearance[page],
          [selected]: {
            ...DEFAULT_SECTION_APPEARANCE,
            corners: previous.presentation.corners as SectionAppearance['corners'],
            ...previous.sectionAppearance[page]?.[selected],
            ...patch,
          },
        },
      },
    }));
    setSaved(false);
  }
  function updatePageAppearance(patch: Partial<PageAppearance>) {
    setSettings((previous) => ({
      ...previous,
      pageAppearance: {
        ...previous.pageAppearance,
        [page]: { ...DEFAULT_PAGE_APPEARANCE, ...previous.pageAppearance[page], ...patch },
      },
    }));
    setSaved(false);
  }
  function select(item: string, tab: InspectorTab = 'content') {
    setSelected(item);
    setInspectorTab(tab);
    if (visibleSectionOrder.includes(item))
      setSectionFocusRequest((current) => ({ key: item, id: (current?.id || 0) + 1 }));
  }
  function captureRowPositions() {
    rowPositions.current.clear();
    for (const row of studioRef.current?.querySelectorAll<HTMLElement>('[data-reorder-key]') || []) {
      rowPositions.current.set(
        `${row.dataset.reorderKind}:${row.dataset.reorderKey}`,
        row.getBoundingClientRect().top,
      );
    }
  }
  function reorder<T extends string>(order: T[], source: T, target: T, position: DropPosition) {
    if (!order.includes(source) || !order.includes(target) || source === target) return null;
    const next = order.filter((key) => key !== source);
    const targetIndex = next.indexOf(target);
    next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source);
    return next.every((key, index) => key === order[index]) ? null : next;
  }
  function startPointerDrag(event: PointerEvent<HTMLButtonElement>, kind: ReorderKind, key: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = {
      pointerId: event.pointerId,
      kind,
      key,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null,
    };
  }
  function movePointerDrag(event: PointerEvent<HTMLButtonElement>) {
    const pointer = activePointer.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!pointer.active) {
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) return;
      pointer.active = true;
      setDragging({ kind: pointer.kind, key: pointer.key });
    }
    event.preventDefault();
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-reorder-key]');
    const key = row?.dataset.reorderKey;
    if (!row || row.dataset.reorderKind !== pointer.kind || !key || key === pointer.key) {
      pointer.target = null;
      setDropTarget(null);
      return;
    }
    const bounds = row.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    pointer.target = { key, position };
    setDropTarget((current) =>
      current?.kind === pointer.kind && current.key === key && current.position === position
        ? current
        : { kind: pointer.kind, key, position },
    );
  }
  function finishDrag() {
    activePointer.current = null;
    setDragging(null);
    setDropTarget(null);
  }
  function endPointerDrag(event: PointerEvent<HTMLButtonElement>) {
    const pointer = activePointer.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const target = pointer.active ? pointer.target : null;
    const order = pointer.kind === 'menu' ? settings.menu : visibleSectionOrder;
    const next = target ? reorder(order, pointer.key, target.key, target.position) : null;
    if (next) {
      captureRowPositions();
      if (pointer.kind === 'menu') setSettings({ ...settings, menu: next as Page[] });
      else setConfig({ ...config, order: [...next, ...config.order.filter((key) => config.hidden.includes(key))] });
      setSaved(false);
    }
    finishDrag();
  }
  function dragClass(kind: ReorderKind, key: string) {
    if (dragging?.kind === kind && dragging.key === key) return ' dragging';
    if (dropTarget?.kind === kind && dropTarget.key === key)
      return ` drop-${dropTarget.position}`;
    return '';
  }
  function move(key: string, offset: number) {
    const order = [...visibleSectionOrder];
    const index = order.indexOf(key);
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    captureRowPositions();
    [order[index], order[target]] = [order[target], order[index]];
    setConfig({ ...config, order: [...order, ...config.order.filter((item) => config.hidden.includes(item))] });
    setSaved(false);
  }
  function removeSection(key: string) {
    setConfig({ ...config, hidden: [...config.hidden, key] });
    setAddingSections(false);
    select('page');
    setSaved(false);
  }
  function addSection(key: string) {
    setConfig({
      ...config,
      order: [...config.order.filter((item) => item !== key), key],
      hidden: config.hidden.filter((item) => item !== key),
    });
    setAddingSections(false);
    setSectionsExpanded(true);
    select(key);
    setSectionFocusRequest((current) => ({ key, id: (current?.id || 0) + 1 }));
    setSaved(false);
  }
  function switchPage(next: Page) {
    if (next === page) return;
    if (changed && !window.confirm('You have unsaved changes. Switch pages?')) return;
    onPageChange(next);
  }
  async function save() {
    if (!changed) return;
    if (analysisRulesError || backtestRulesError) {
      setError(analysisRulesError || backtestRulesError);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (layoutChanged) {
        const result = await put<Layout>('/layouts/' + page, {
          expected_revision: layout.revision,
          config,
        });
        onSaved(result);
      }
      if (preferencesChanged) onPreferencesSaved(settings);
      if (backtestChanged) onBacktestSettingsSaved(draftBacktest, analysisChanged);
      setSaved(true);
      if (analysisChanged || backtestChanged) preservePreviewAfterSave.current = true;
      if (analysisChanged) onAnalysisSettingsSaved(draftPeriod, draftSource, draftAnalysisRules);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save Studio changes.');
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (portfolioEditor) {
      setPortfolioEditor(null);
      return;
    }
    if (changed && !window.confirm('You have unsaved changes. Exit Studio?')) return;
    onClose();
  }
  function openDialog(action: () => void) {
    if (changed && !window.confirm('You have unsaved changes. Leave Studio?')) return;
    action();
  }
  function leaveForLanding(event: MouseEvent<HTMLAnchorElement>) {
    if (changed && !window.confirm('You have unsaved changes. Exit Studio?')) {
      event.preventDefault();
      return;
    }
    onClose();
  }
  useDialogFocus(studioRef, close, 'first', !portfolioEditor);

  return (
    <div
      ref={studioRef}
      className={'studio-shell studio-editor' + (closing ? ' studio-exiting' : '')}
      role="dialog"
      aria-modal="true"
      aria-label="doFiin Studio"
    >
      <header className="studio-header" inert={!!portfolioEditor}>
        <BrandHome onClick={leaveForLanding} />
        <span className="studio-slash">/</span>
        <span className="studio-label">Studio</span>
        <span className="studio-header-spacer" />
        <span className={'studio-header-status ' + (changed ? 'unsaved' : '')} role="status">
          {busy ? 'Saving…' : changed ? 'Unsaved changes' : saved ? 'Saved' : 'Up to date'}
        </span>
        <StudioModeSwitch checked onToggle={close} />
        <button
          className="button primary studio-save-button"
          onClick={() => void save()}
          disabled={busy || !changed}
        >
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : saved && !changed ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}{' '}
          Save changes
        </button>
        <button
          className="icon-button studio-close-button"
          aria-label="Close Studio"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="studio-body" inert={!!portfolioEditor}>
        <aside className="studio-left" aria-label="Studio navigation and sections">
          <div className="studio-panel-heading">
            <button
              className="studio-group-toggle"
              aria-expanded={navigationExpanded}
              aria-controls="studio-navigation-list"
              onClick={() => setNavigationExpanded((expanded) => !expanded)}
            >
              <ChevronDown size={16} aria-hidden="true" />
              <strong>Navigation</strong>
            </button>
          </div>
          <div className="studio-tree-group" aria-label="Navigation">
            <div
              id="studio-navigation-list"
              className="studio-tree-contents"
              data-expanded={navigationExpanded}
              aria-hidden={!navigationExpanded}
              inert={!navigationExpanded}
            >
              <div className="studio-tree-contents-inner">
            {settings.menu.map((item, index) => (
              <div
                className={
                  'studio-tree-row studio-tree-child ' +
                  (page === item || selected === 'menu:' + item ? 'selected' : '') +
                  dragClass('menu', item)
                }
                key={item}
                data-reorder-kind="menu"
                data-reorder-key={item}
              >
                <button
                  type="button"
                  className="studio-drag-handle"
                  aria-label={'Drag ' + PAGE_LABELS[item]}
                  title="Drag to reorder"
                  onPointerDown={(event) => startPointerDrag(event, 'menu', item)}
                  onPointerMove={movePointerDrag}
                  onPointerUp={endPointerDrag}
                  onPointerCancel={finishDrag}
                >
                  <GripVertical size={14} />
                </button>
                <button
                  className="studio-tree-select"
                  aria-current={page === item ? 'page' : undefined}
                  onClick={() => item === page ? select('page') : switchPage(item)}
                >
                  <span>{PAGE_LABELS[item]}</span>
                </button>
                <div className="studio-tree-actions">
                  <button
                    aria-label={'Edit ' + PAGE_LABELS[item] + ' menu item'}
                    onClick={() => select('menu:' + item)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    aria-label={'Move ' + PAGE_LABELS[item] + ' up'}
                    disabled={index === 0}
                    onClick={() => {
                      const menu = [...settings.menu];
                      captureRowPositions();
                      [menu[index - 1], menu[index]] = [menu[index], menu[index - 1]];
                      setSettings({ ...settings, menu });
                      setSaved(false);
                    }}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label={'Move ' + PAGE_LABELS[item] + ' down'}
                    disabled={index === settings.menu.length - 1}
                    onClick={() => {
                      const menu = [...settings.menu];
                      captureRowPositions();
                      [menu[index], menu[index + 1]] = [menu[index + 1], menu[index]];
                      setSettings({ ...settings, menu });
                      setSaved(false);
                    }}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
            ))}
            <button
              className="studio-tree-add studio-add-menu-item"
              disabled={settings.menu.length === DEFAULT_MENU.length}
              onClick={() => setAddingMenu(!addingMenu)}
            >
              <Plus size={14} /> Add menu item
            </button>
            {addingMenu && (
              <div className="studio-add-menu">
                <StudioSelect
                label="Add navigation menu"
                value=""
                placeholder="Select a page"
                options={DEFAULT_MENU.filter((item) => !settings.menu.includes(item)).map((item) => ({
                  value: item,
                  label: PAGE_LABELS[item],
                }))}
                onChange={(value) => {
                  const item = value as Page;
                  setSettings({ ...settings, menu: [...settings.menu, item] });
                  setAddingMenu(false);
                  select('menu:' + item);
                }}
                />
              </div>
            )}
              </div>
            </div>
          </div>
          <div className="studio-tree-group">
            <button
              className={
                'studio-tree-row studio-tree-parent ' + (selected === 'page' ? 'selected' : '')
              }
              aria-expanded={sectionsExpanded}
              aria-controls="studio-sections-list"
              onClick={() => {
                setSectionsExpanded((expanded) => !expanded);
                select('page');
              }}
            >
              <ChevronDown size={16} className="studio-section-chevron" aria-hidden="true" />
              <LayoutTemplate size={16} />
              <span>Sections</span>
            </button>
            <div
              id="studio-sections-list"
              className="studio-tree-contents"
              data-expanded={sectionsExpanded}
              aria-hidden={!sectionsExpanded}
              inert={!sectionsExpanded}
            >
              <div className="studio-tree-contents-inner">
            {visibleSectionOrder.map((key, index) => (
              <div
                className={
                  'studio-tree-row studio-tree-child ' + (selected === key ? 'selected' : '') +
                  dragClass('widget', key)
                }
                key={key}
                data-reorder-kind="widget"
                data-reorder-key={key}
              >
                <button
                  type="button"
                  className="studio-drag-handle"
                  aria-label={'Drag ' + (config.titles[key] || TITLES[key])}
                  title="Drag to reorder"
                  onPointerDown={(event) => startPointerDrag(event, 'widget', key)}
                  onPointerMove={movePointerDrag}
                  onPointerUp={endPointerDrag}
                  onPointerCancel={finishDrag}
                >
                  <GripVertical size={14} />
                </button>
                <button className="studio-tree-select" onClick={() => select(key)}>
                  <span>{config.titles[key] || TITLES[key]}</span>
                </button>
                <div className="studio-tree-actions">
                  <button
                    aria-label={'Move ' + TITLES[key] + ' up'}
                    disabled={index === 0}
                    onClick={() => move(key, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label={'Move ' + TITLES[key] + ' down'}
                    disabled={index === visibleSectionOrder.length - 1}
                    onClick={() => move(key, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    aria-label={'Remove ' + (config.titles[key] || TITLES[key]) + ' section'}
                    onClick={() => removeSection(key)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            <button
              className="studio-tree-add"
              aria-expanded={addingSections}
              aria-controls="studio-section-picker"
              onClick={() => setAddingSections((open) => !open)}
            >
              <Plus size={14} /> Add sections
            </button>
            {addingSections && (
              <div id="studio-section-picker" className="studio-section-picker">
                {config.hidden.length ? (
                  config.order.filter((key) => config.hidden.includes(key)).map((key) => (
                    <button key={key} onClick={() => addSection(key)}>
                      <Plus size={13} /> {config.titles[key] || TITLES[key]}
                    </button>
                  ))
                ) : (
                  <p>All available sections are already on this page.</p>
                )}
              </div>
            )}
              </div>
            </div>
          </div>
          <div className="studio-tree-group">
            <div className="studio-tree-caption">GLOBAL</div>
            <button
              className={
                'studio-tree-row studio-tree-parent ' + (selected === 'theme' ? 'selected' : '')
              }
              onClick={() => select('theme', 'design')}
            >
              <Palette size={16} />
              <span>Theme settings</span>
            </button>
          </div>
          <div className="studio-tree-footer">
            Drag the dotted handles to reorder. Select an item to edit it.
          </div>
        </aside>
        <main className="studio-canvas">
          <div className={'studio-preview-toolbar' + (deviceViewport === 'desktop' ? ' has-viewports' : '')}>
            <div className="studio-preview-path">
              <span className="studio-preview-dot" /> doFiin / {PAGE_LABELS[page]}
            </div>
            {deviceViewport === 'desktop' && (
              <div className="viewport-buttons" aria-label="Preview size">
                {(
                  [
                    ['desktop', Monitor, 'Desktop'],
                    ['tablet', Tablet, 'Tablet'],
                    ['mobile', Smartphone, 'Mobile'],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    className={viewport === key ? 'active' : ''}
                    aria-label={label + ' preview'}
                    aria-pressed={viewport === key}
                    onClick={() => setViewport(key)}
                  >
                    <Icon size={15} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
            <span className="studio-preview-live">
              <Eye size={14} /> {previewPending || !portfolioAnalysisReady ? 'Updating preview…' : previewError ? 'Preview unavailable' : 'Live preview'}
            </span>
          </div>
          <div className="studio-preview-stage" aria-busy={!portfolioAnalysisReady}>
            {!portfolioAnalysisReady && <div className="studio-preview-loading" role="status">Updating sections from the active portfolio…</div>}
            {previewError && <div className="studio-preview-error" role="alert">{previewError}</div>}
            <div className={'studio-preview ' + previewViewport} data-preview-viewport={previewViewport} style={pageAppearanceStyle(pageAppearance)}>
              <div className="studio-preview-brand">
                <BrandHome onClick={leaveForLanding} />
                <span className="tag">Preview</span>
              </div>
              <div className="studio-preview-heading">
                <span className="eyebrow">
                  {PAGE_LABELS[page].toUpperCase()} · {settings.locale}
                </span>
                <h2>{content.title}</h2>
                <p>{content.description}</p>
              </div>
              {portfolioAnalysisReady && <Dashboard
                presentation={settings.presentation}
                sectionAppearance={settings.sectionAppearance[page]}
                page={page}
                analysis={previewAnalysis ? { ...analysis, result: previewAnalysis } : analysis}
                liveGrowth={!previewAnalysis && !analysisChanged ? liveGrowth : null}
                liveSecondView={!previewAnalysis && !analysisChanged && liveSecondView}
                liveSamples={!previewAnalysis && !analysisChanged ? liveSamples : []}
                portfolioVersion={portfolio?.latest_version}
                layout={config}
                backtest={previewBacktest ? { id: 'preview', parameters: { analysis_run_id: analysis.id }, result: previewBacktest } : backtest}
                btBusy={false}
                btForm={draftBacktest}
                setBtForm={() => {}}
                onBacktest={() => {}}
                onOptimize={() => {}}
                preview
                selectedSection={highlightedSection || undefined}
              />}
            </div>
          </div>
        </main>
        <aside className="studio-right" aria-label="Studio settings">
          <div className="studio-inspector-heading">
            <span>Settings</span>
            <strong>{inspectorTitle}</strong>
          </div>
          <div className="studio-tabs" role="tablist" aria-label="Settings category">
            {(['content', 'design', 'function'] as const).map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={inspectorTab === item}
                onClick={() => setInspectorTab(item)}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <div className="studio-inspector-content" role="tabpanel">
            {inspectorTab === 'content' && selected === 'page' && (
              <div className="studio-settings-section">
                <p>These sections show data from {portfolio?.name || 'the active portfolio'}. Choose the portfolio and shared analysis settings in Function.</p>
                <label>
                  Heading
                  <input
                    maxLength={120}
                    value={content.title}
                    onChange={(event) => updateContent({ title: event.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    maxLength={300}
                    rows={5}
                    value={content.description}
                    onChange={(event) => updateContent({ description: event.target.value })}
                  />
                </label>
                {currentContent && (
                  <button
                    className="studio-inline-action"
                    onClick={() => {
                      const byPage = { ...settings.content[page] };
                      delete byPage[settings.locale];
                      setSettings({
                        ...settings,
                        content: { ...settings.content, [page]: byPage },
                      });
                    }}
                  >
                    <RotateCcw size={14} /> Reset page copy
                  </button>
                )}
              </div>
            )}
            {inspectorTab === 'content' && isWidget && (
              <div className="studio-settings-section">
                <h4>Widget content</h4>
                <label>
                  Title
                  <input
                    maxLength={100}
                    value={config.titles[selected] ?? TITLES[selected]}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        titles: { ...config.titles, [selected]: event.target.value },
                      })
                    }
                  />
                </label>
                <p>Widget titles are shared across content languages.</p>
              </div>
            )}
            {inspectorTab === 'content' && isMenu && (
              <div className="studio-settings-section">
                <h4>Menu item</h4>
                <p>
                  {inspectorTitle} links to the {inspectorTitle} dashboard. Drag it in the section
                  list to change its position.
                </p>
                <button
                  className="studio-inline-action danger"
                  disabled={settings.menu.length === 1}
                  onClick={() => {
                    setSettings({
                      ...settings,
                      menu: settings.menu.filter((item) => item !== selected.slice(5)),
                    });
                    select('page');
                  }}
                >
                  <Trash2 size={14} /> Remove from menu
                </button>
              </div>
            )}
            {inspectorTab === 'content' && selected === 'theme' && (
              <div className="studio-settings-section">
                <h4>Theme</h4>
                <p>Select Design to edit chart color, legend and corners.</p>
              </div>
            )}
            {inspectorTab === 'design' && (
              <>
                {isWidget && (
                  <>
                    <div className="studio-settings-section">
                      <h4>Layout</h4>
                      <div className="studio-field">
                        <span>Content width</span>
                        <StudioSelect
                          label="Content width"
                          value={sectionAppearance.width}
                          options={[{ value: 'stretch', label: 'Stretch' }, { value: 'contained', label: 'Contained' }]}
                          onChange={(value) => updateSectionAppearance({ width: value as SectionAppearance['width'] })}
                        />
                      </div>
                      <div className="studio-field">
                        <span>Section height</span>
                        <StudioSelect
                          label="Section height"
                          value={sectionAppearance.height}
                          options={[
                            { value: 'auto', label: 'Auto' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'large', label: 'Large' },
                          ]}
                          onChange={(value) => updateSectionAppearance({ height: value as SectionAppearance['height'] })}
                        />
                      </div>
                      <div className="studio-field">
                        <span>Spacing</span>
                        <StudioSelect
                          label="Section spacing"
                          value={sectionAppearance.spacing}
                          options={[
                            { value: 'compact', label: 'Compact' },
                            { value: 'comfortable', label: 'Comfortable' },
                            { value: 'spacious', label: 'Spacious' },
                          ]}
                          onChange={(value) => updateSectionAppearance({ spacing: value as SectionAppearance['spacing'] })}
                        />
                      </div>
                    </div>
                    <div className="studio-settings-section">
                      <h4>Background</h4>
                      <StudioBackgroundPicker
                        key={`${page}:${selected}`}
                        value={sectionAppearance.background}
                        onChange={(background) => updateSectionAppearance({ background })}
                      />
                      <div className="studio-field">
                        <span>Border radius</span>
                        <StudioSelect
                          label="Section border radius"
                          value={String(sectionAppearance.corners)}
                          options={[0, 4, 8, 12].map((radius) => ({ value: String(radius), label: `${radius} px` }))}
                          onChange={(value) => updateSectionAppearance({ corners: Number(value) as SectionAppearance['corners'] })}
                        />
                      </div>
                    </div>
                  </>
                )}
                {isMenu && (
                  <div className="studio-settings-section">
                    <h4>Navigation order</h4>
                    <p>Use the arrows or drag the menu items in the section list.</p>
                  </div>
                )}
                {selected === 'page' && (
                  <div className="studio-settings-section">
                    <h4>Page layout</h4>
                    <p>These settings apply to the entire {PAGE_LABELS[page]} page, including its child sections.</p>
                    <div className="studio-field">
                      <span>Left &amp; right padding</span>
                      <StudioSelect
                        label="Page left and right padding"
                        value={String(pageAppearance.horizontalPadding ?? 'default')}
                        options={[{ value: 'default', label: 'Default' }, ...[16, 24, 32, 40, 48, 60, 80].map((n) => ({ value: String(n), label: `${n} px` }))]}
                        onChange={(value) => updatePageAppearance({ horizontalPadding: value === 'default' ? null : Number(value) })}
                      />
                    </div>
                    <div className="studio-field">
                      <span>Top padding</span>
                      <StudioSelect
                        label="Page top padding"
                        value={String(pageAppearance.topPadding ?? 'default')}
                        options={[{ value: 'default', label: 'Default' }, ...[24, 40, 48, 64, 80, 96].map((n) => ({ value: String(n), label: `${n} px` }))]}
                        onChange={(value) => updatePageAppearance({ topPadding: value === 'default' ? null : Number(value) })}
                      />
                    </div>
                    <div className="studio-field">
                      <span>Bottom padding</span>
                      <StudioSelect
                        label="Page bottom padding"
                        value={String(pageAppearance.bottomPadding ?? 'default')}
                        options={[{ value: 'default', label: 'Default' }, ...[24, 40, 48, 64, 80, 96].map((n) => ({ value: String(n), label: `${n} px` }))]}
                        onChange={(value) => updatePageAppearance({ bottomPadding: value === 'default' ? null : Number(value) })}
                      />
                    </div>
                    <div className="studio-field">
                      <span>Content max width</span>
                      <StudioSelect
                        label="Page content max width"
                        value={String(pageAppearance.maxWidth ?? 'default')}
                        options={[{ value: 'default', label: 'Default' }, ...[1200, 1400, 1600].map((n) => ({ value: String(n), label: `${n} px` }))]}
                        onChange={(value) => updatePageAppearance({ maxWidth: value === 'default' ? null : Number(value) })}
                      />
                    </div>
                    <div className="studio-field">
                      <span>Section density</span>
                      <StudioSelect
                        label="Page section density"
                        value={config.density}
                        options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
                        onChange={(value) => setConfig({ ...config, density: value as 'comfortable' | 'compact' })}
                      />
                    </div>
                  </div>
                )}
                {isChartWidget && (
                  <div className="studio-settings-section">
                    <h4>{inspectorTitle} chart</h4>
                    {hasChartStyle && <div className="studio-field">
                      <span>Chart type</span>
                      <StudioSelect
                        label={`${inspectorTitle} chart type`}
                        value={sectionAppearance.chartStyle ?? config.chart_style}
                        options={[{ value: 'area', label: 'Area' }, { value: 'line', label: 'Line' }]}
                        onChange={(value) => updateSectionAppearance({ chartStyle: value as 'area' | 'line' })}
                      />
                    </div>}
                    <label>
                      Chart color
                      <div className="studio-color-control">
                        <input
                          type="color"
                          aria-label={`${inspectorTitle} chart color`}
                          value={sectionAppearance.chartColor ?? settings.presentation.color}
                          onChange={(event) => updateSectionAppearance({ chartColor: event.target.value })}
                        />
                        <span>{(sectionAppearance.chartColor ?? settings.presentation.color).toUpperCase()}</span>
                      </div>
                    </label>
                    {hasChartLegend && <label className="studio-switch-row">
                      <span>Show legend</span>
                      <input
                        type="checkbox"
                        checked={sectionAppearance.showLegend ?? settings.presentation.legend}
                        onChange={(event) => updateSectionAppearance({ showLegend: event.target.checked })}
                      />
                    </label>}
                  </div>
                )}
                {selected === 'theme' && <div className="studio-settings-section">
                  <h4>Charts &amp; spacing</h4>
                  <div className="studio-field">
                    <span>Chart type</span>
                    <StudioSelect
                      label="Chart type"
                      value={config.chart_style}
                      options={[{ value: 'area', label: 'Area' }, { value: 'line', label: 'Line' }]}
                      onChange={(value) =>
                        setConfig({ ...config, chart_style: value as 'area' | 'line' })
                      }
                    />
                  </div>
                  <div className="studio-field">
                    <span>Density</span>
                    <StudioSelect
                      label="Density"
                      value={config.density}
                      options={[
                        { value: 'comfortable', label: 'Comfortable' },
                        { value: 'compact', label: 'Compact' },
                      ]}
                      onChange={(value) =>
                        setConfig({
                          ...config,
                          density: value as 'comfortable' | 'compact',
                        })
                      }
                    />
                  </div>
                  <label>
                    Chart color
                    <div className="studio-color-control">
                      <input
                        type="color"
                        aria-label="Chart color"
                        value={settings.presentation.color}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            presentation: { ...settings.presentation, color: event.target.value },
                          })
                        }
                      />
                      <span>{settings.presentation.color.toUpperCase()}</span>
                    </div>
                  </label>
                  <label className="studio-switch-row">
                    <span>Show legend</span>
                    <input
                      type="checkbox"
                      checked={settings.presentation.legend}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          presentation: { ...settings.presentation, legend: event.target.checked },
                        })
                      }
                    />
                  </label>
                  <div className="studio-field">
                    <span>Corner radius</span>
                    <StudioSelect
                      label="Corner radius"
                      value={String(settings.presentation.corners)}
                      options={[0, 4, 8, 12].map((radius) => ({
                        value: String(radius),
                        label: `${radius} px`,
                      }))}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          presentation: {
                            ...settings.presentation,
                            corners: Number(value),
                          },
                        })
                      }
                    />
                  </div>
                </div>}
              </>
            )}
            {inspectorTab === 'function' && (
              <div className="studio-settings-section studio-function">
                <h4>Data &amp; rules</h4>
                {isMenu ? (
                  <>
                    <p>{inspectorTitle} opens its analysis page. Select a section on that page to edit its functions.</p>
                    <button className="button outline full" onClick={() => switchPage(selected.slice(5) as Page)}>
                      Open {inspectorTitle} page
                    </button>
                  </>
                ) : selected === 'theme' ? (
                  <p>Theme appearance is configured in the Design tab.</p>
                ) : isWidget ? (
                  <>
                    <p>This section reads its data and relevant rules from {PAGE_LABELS[page]} sections. Edit the parent to change its inputs.</p>
                    <dl>
                      <dt>Parent</dt>
                      <dd>{PAGE_LABELS[page]} sections</dd>
                      <dt>Active portfolio</dt>
                      <dd>{portfolio?.name || 'No portfolio selected'}</dd>
                      <dt>Purchase date</dt>
                      <dd>{portfolio?.latest_version.purchase_date || 'Not set'}</dd>
                      <dt>Starting capital</dt>
                      <dd>${Number(portfolio?.latest_version.initial_capital || 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                      <dt>Benchmark</dt>
                      <dd>{selectedBenchmarkProfile?.name || '—'}</dd>
                      <dt>Analysis period</dt>
                      <dd>{draftPeriod}</dd>
                      {page === 'risk' || page === 'factors' ? <>
                        <dt>Risk-free rate</dt>
                        <dd>{(draftAnalysisRules.riskFreeRate * 100).toFixed(2)}% / year</dd>
                      </> : null}
                      {page === 'signals' || page === 'backtest' ? <>
                        <dt>Signal windows</dt>
                        <dd>MA{draftAnalysisRules.shortWindow} / MA{draftAnalysisRules.longWindow}</dd>
                      </> : null}
                      {page === 'backtest' && <>
                        <dt>Strategy</dt>
                        <dd>{draftBacktest.strategy === 'BUY_AND_HOLD' ? 'Buy and hold' : `MA${draftAnalysisRules.shortWindow} / MA${draftAnalysisRules.longWindow} crossover`}</dd>
                      </>}
                    </dl>
                    {selected === 'growth' && <div className="studio-field">
                      <span>Benchmark</span>
                      <StudioSelect
                        label="Cumulative growth benchmark profile"
                        value={selectedBenchmarkProfile?.id || ''}
                        options={benchmarkProfiles.map((item) => ({ value: item.id, label: item.name }))}
                        onChange={(benchmarkPortfolioId) => setDraftAnalysisRules({ ...draftAnalysisRules, benchmarkPortfolioId })}
                      />
                      <p>This profile is shared with the other analysis sections. Edit its holdings by selecting it as the active portfolio.</p>
                    </div>}
                    <button className="button outline full studio-function-action" onClick={() => select('page', 'function')}>
                      Edit parent settings
                    </button>
                  </>
                ) : (
                  <>
                    <p>{FUNCTION_DESCRIPTIONS[page]} The preview shows changes to the affected sections before you save.</p>
                    {selected === 'page' && <>
                        <div className="studio-field">
                          <span>Active portfolio</span>
                          <StudioSelect
                            label="Active portfolio for sections"
                            value={portfolio?.id || ''}
                            options={portfolios.map((item) => ({ value: item.id, label: item.name }))}
                            onChange={onPortfolioChange}
                          />
                        </div>
                        <button className="button outline full studio-function-action" onClick={() => setPortfolioEditor('create')}>
                          <Plus size={16} /> Add portfolio
                        </button>
                        {portfolio && (
                          <button className="button outline full studio-function-action" onClick={() => setPortfolioEditor('rename')}>
                            <Pencil size={16} /> Rename active portfolio
                          </button>
                        )}
                        {portfolio && (
                          <button className="button outline full studio-function-action" onClick={() => setPortfolioEditor('edit')}>
                            <Pencil size={16} /> Edit holdings, date &amp; capital
                          </button>
                        )}
                        {portfolioLoading && <p role="status">Updating child sections from the selected portfolio…</p>}
                    </>}
                    <div className="studio-field">
                      <span>Benchmark</span>
                      <StudioSelect
                        label="Benchmark profile for analysis sections"
                        value={selectedBenchmarkProfile?.id || ''}
                        options={benchmarkProfiles.map((item) => ({ value: item.id, label: item.name }))}
                        onChange={(benchmarkPortfolioId) => setDraftAnalysisRules({ ...draftAnalysisRules, benchmarkPortfolioId })}
                      />
                    </div>
                    <div className="studio-field">
                      <span>Analysis period</span>
                      <StudioSelect
                        label="Studio analysis period"
                        value={draftPeriod}
                        options={['1M', '3M', '6M', '1Y', '3Y'].map((value) => ({ value, label: value }))}
                        onChange={setDraftPeriod}
                      />
                    </div>
                    {(page === 'risk' || page === 'factors') && <label>
                      Risk-free rate (% / year)
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.01}
                        value={Number((draftAnalysisRules.riskFreeRate * 100).toFixed(2))}
                        onChange={(event) => setDraftAnalysisRules({ ...draftAnalysisRules, riskFreeRate: Number(event.target.value) / 100 })}
                      />
                    </label>}
                    {(page === 'signals' || page === 'backtest') && <div className="studio-function-rules">
                      <h4>Moving-average windows</h4>
                      <p>These windows drive the signals and the crossover backtest.</p>
                      <label>
                        Short window (sessions)
                        <input
                          type="number"
                          min={2}
                          max={100}
                          step={1}
                          value={draftAnalysisRules.shortWindow}
                          onChange={(event) => setDraftAnalysisRules({ ...draftAnalysisRules, shortWindow: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Long window (sessions)
                        <input
                          type="number"
                          min={3}
                          max={250}
                          step={1}
                          value={draftAnalysisRules.longWindow}
                          onChange={(event) => setDraftAnalysisRules({ ...draftAnalysisRules, longWindow: Number(event.target.value) })}
                        />
                      </label>
                    </div>}
                    {analysisRulesError && <p className="inline-error" role="alert">{analysisRulesError}</p>}
                    {page === 'backtest' && (
                      <div className="studio-function-rules">
                        <h4>Backtest rules</h4>
                        <div className="studio-field">
                          <span>Strategy</span>
                          <StudioSelect
                            label="Strategy"
                            value={draftBacktest.strategy}
                            options={[
                              { value: 'MA_CROSSOVER', label: `MA ${draftAnalysisRules.shortWindow} / ${draftAnalysisRules.longWindow} crossover` },
                              { value: 'BUY_AND_HOLD', label: 'Buy and hold' },
                            ]}
                            onChange={(value) => setDraftBacktest({ ...draftBacktest, strategy: value })}
                          />
                        </div>
                        <label>
                          Initial capital (USD)
                          <input type="number" min={0.01} max={1e9} value={draftBacktest.initial_capital} onChange={(event) => setDraftBacktest({ ...draftBacktest, initial_capital: Number(event.target.value) })} />
                        </label>
                        <label>
                          Fees (bps)
                          <input type="number" min={0} max={100} value={draftBacktest.fee_bps} onChange={(event) => setDraftBacktest({ ...draftBacktest, fee_bps: Number(event.target.value) })} />
                        </label>
                        <label>
                          Slippage (bps)
                          <input type="number" min={0} max={100} value={draftBacktest.slippage_bps} onChange={(event) => setDraftBacktest({ ...draftBacktest, slippage_bps: Number(event.target.value) })} />
                        </label>
                        <div className="studio-field">
                          <span>Rebalance</span>
                          <StudioSelect
                            label="Rebalance"
                            value={draftBacktest.rebalance_frequency}
                            options={[
                              { value: 'MONTHLY', label: 'Monthly' },
                              { value: 'NONE', label: 'None' },
                            ]}
                            onChange={(value) => setDraftBacktest({ ...draftBacktest, rebalance_frequency: value })}
                          />
                        </div>
                        <p>The simulation preview updates as you edit these rules.</p>
                      </div>
                    )}
                    {backtestRulesError && <p className="inline-error" role="alert">{backtestRulesError}</p>}
                    <dl>
                      <dt>Active portfolio</dt>
                      <dd>{(previewAnalysis || analysis.result).metadata.portfolio_name}</dd>
                      <dt>Purchase date</dt>
                      <dd>{portfolio?.latest_version.purchase_date || 'Not set'}</dd>
                      <dt>Starting capital</dt>
                      <dd>${Number(portfolio?.latest_version.initial_capital || 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                      <dt>Current date range</dt>
                      <dd>{(previewAnalysis || analysis.result).metadata.first_date} — {(previewAnalysis || analysis.result).metadata.last_date}</dd>
                      <dt>Benchmark</dt>
                      <dd>{(previewAnalysis || analysis.result).metadata.benchmark}</dd>
                      {page === 'signals' && (
                        <>
                          <dt>Signal windows</dt>
                          <dd>MA{(previewAnalysis || analysis.result).signals.short_window} / MA{(previewAnalysis || analysis.result).signals.long_window}</dd>
                        </>
                      )}
                    </dl>
                    <button className="studio-inline-action" onClick={() => openDialog(onOpenHelp)}>
                      Open analysis help
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <div className="studio-save-state">
            {changed ? 'Unsaved changes' : 'All changes saved'}
          </div>
        </aside>
      </div>
      {portfolioEditor === 'rename' && portfolio && (
        <RenameDialog
          portfolio={portfolio}
          onSaved={onPortfolioSaved}
          onClose={() => setPortfolioEditor(null)}
        />
      )}
      {portfolioEditor && portfolioEditor !== 'rename' && (
        <PortfolioDialog
          portfolio={portfolioEditor === 'edit' ? portfolio : null}
          instruments={instruments}
          onSaved={async (savedPortfolio) => {
            setDraftBacktest((current) => ({ ...current, initial_capital: Number(savedPortfolio.latest_version.initial_capital) }));
            await onPortfolioSaved(savedPortfolio);
          }}
          onClose={() => setPortfolioEditor(null)}
        />
      )}
    </div>
  );
}
