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
import StudioModeSwitch from './StudioModeSwitch';
import StudioSelect from './StudioSelect';
import { Dashboard, TITLES } from './pages';
import type { BacktestForm } from './pages';
import type { Analysis, Backtest, Layout, Page } from './types';
import { put } from './api';
import { DEFAULT_MENU, DEFAULT_SECTION_APPEARANCE, PAGE_LABELS } from './preferences';
import type { PageContent, Preferences, SectionAppearance } from './preferences';
import { useDialogFocus } from './useDialogFocus';

type Props = {
  closing: boolean;
  preferences: Preferences;
  onPreferencesSaved: (preferences: Preferences) => void;
  page: Page;
  analysis: Analysis;
  backtest: Backtest | null;
  layout: Layout;
  btForm: BacktestForm;
  period: string;
  source: 'demo' | 'yahoo';
  defaultContent: PageContent;
  onAnalysisSettingsSaved: (period: string, source: 'demo' | 'yahoo') => void;
  onBacktestSettingsSaved: (form: BacktestForm) => void;
  onOpenPortfolioSettings: () => void;
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
const FUNCTION_DESCRIPTIONS: Record<Page, string> = {
  portfolio: 'Choose the data behind this portfolio view and edit its holdings and weights.',
  risk: 'Choose the data period and source used by the risk charts.',
  signals: 'Choose the data used by the moving-average signals.',
  backtest: 'Choose the data and simulation rules used by this backtest.',
  factors: 'Choose the data used by factor and optimization analysis.',
};

export default function Studio({
  closing,
  preferences,
  onPreferencesSaved,
  page,
  analysis,
  backtest,
  layout,
  btForm,
  period,
  source,
  defaultContent,
  onAnalysisSettingsSaved,
  onBacktestSettingsSaved,
  onOpenPortfolioSettings,
  onOpenHelp,
  onPageChange,
  onClose,
  onSaved,
}: Props) {
  const [config, setConfig] = useState(() => structuredClone(layout.config));
  const [settings, setSettings] = useState(() => structuredClone(preferences));
  const [draftPeriod, setDraftPeriod] = useState(period);
  const [draftSource, setDraftSource] = useState(source);
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
  const analysisChanged = draftPeriod !== period || draftSource !== source;
  const backtestChanged = JSON.stringify(draftBacktest) !== JSON.stringify(btForm);
  const changed = layoutChanged || preferencesChanged || analysisChanged || backtestChanged;
  const currentContent = settings.content[page]?.[settings.locale];
  const content = currentContent || defaultContent;
  const visibleSectionOrder = config.order.filter((key) => !config.hidden.includes(key));
  const isWidget = visibleSectionOrder.includes(selected);
  const sectionAppearance: SectionAppearance = {
    ...DEFAULT_SECTION_APPEARANCE,
    corners: settings.presentation.corners as SectionAppearance['corners'],
    ...settings.sectionAppearance[page]?.[selected],
  };
  const isMenu = selected.startsWith('menu:');
  const inspectorTitle =
    selected === 'page'
      ? 'Page content'
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
      if (backtestChanged) onBacktestSettingsSaved(draftBacktest);
      setSaved(true);
      if (analysisChanged) onAnalysisSettingsSaved(draftPeriod, draftSource);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save Studio changes.');
    } finally {
      setBusy(false);
    }
  }
  function close() {
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
  useDialogFocus(studioRef, close, 'first');

  return (
    <div
      ref={studioRef}
      className={'studio-shell studio-editor' + (closing ? ' studio-exiting' : '')}
      role="dialog"
      aria-modal="true"
      aria-label="doFiin Studio"
    >
      <header className="studio-header">
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
      <div className="studio-body">
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
              className="studio-tree-add"
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
              <Eye size={14} /> Live preview
            </span>
          </div>
          <div className="studio-preview-stage">
            <div className={'studio-preview ' + previewViewport} data-preview-viewport={previewViewport}>
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
              <Dashboard
                presentation={settings.presentation}
                sectionAppearance={settings.sectionAppearance[page]}
                page={page}
                analysis={analysis}
                layout={config}
                backtest={backtest}
                btBusy={false}
                btForm={btForm}
                setBtForm={() => {}}
                onBacktest={() => {}}
                onOptimize={() => {}}
                preview
                selectedSection={highlightedSection || undefined}
              />
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
                      <div className="studio-background-options" role="group" aria-label="Section background">
                        {(['default', 'white', 'mist', 'sand'] as const).map((background) => (
                          <button
                            key={background}
                            type="button"
                            className={sectionAppearance.background === background ? 'active' : ''}
                            aria-pressed={sectionAppearance.background === background}
                            onClick={() => updateSectionAppearance({ background })}
                          >
                            <span className={'studio-background-swatch ' + background} aria-hidden="true" />
                            {background[0].toUpperCase() + background.slice(1)}
                          </button>
                        ))}
                      </div>
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
                {!isWidget && <div className="studio-settings-section">
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
                ) : (
                  <>
                    <p>{FUNCTION_DESCRIPTIONS[page]} Save changes to apply new analysis settings.</p>
                    <div className="studio-field">
                      <span>Analysis period</span>
                      <StudioSelect
                        label="Studio analysis period"
                        value={draftPeriod}
                        options={['1M', '3M', '6M', '1Y', '3Y'].map((value) => ({ value, label: value }))}
                        onChange={setDraftPeriod}
                      />
                    </div>
                    <div className="studio-field">
                      <span>Data source</span>
                      <StudioSelect
                        label="Studio data source"
                        value={draftSource}
                        options={[
                          { value: 'demo', label: 'Simulated data' },
                          { value: 'yahoo', label: 'Yahoo Finance' },
                        ]}
                        onChange={(value) => setDraftSource(value as 'demo' | 'yahoo')}
                      />
                    </div>
                    {page === 'portfolio' && (
                      <button className="button outline full studio-function-action" onClick={() => openDialog(onOpenPortfolioSettings)}>
                        Edit portfolio holdings &amp; weights
                      </button>
                    )}
                    {page === 'backtest' && (
                      <div className="studio-function-rules">
                        <h4>Backtest rules</h4>
                        <div className="studio-field">
                          <span>Strategy</span>
                          <StudioSelect
                            label="Strategy"
                            value={draftBacktest.strategy}
                            options={[
                              { value: 'MA_CROSSOVER', label: 'MA 20 / 50 crossover' },
                              { value: 'BUY_AND_HOLD', label: 'Buy and hold' },
                            ]}
                            onChange={(value) => setDraftBacktest({ ...draftBacktest, strategy: value })}
                          />
                        </div>
                        <label>
                          Initial capital (USD)
                          <input type="number" min={100} max={1e9} value={draftBacktest.initial_capital} onChange={(event) => setDraftBacktest({ ...draftBacktest, initial_capital: Number(event.target.value) })} />
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
                        <p>Save these rules, then run the backtest from its dashboard.</p>
                      </div>
                    )}
                    <dl>
                      <dt>Active portfolio</dt>
                      <dd>{analysis.result.metadata.portfolio_name}</dd>
                      <dt>Current date range</dt>
                      <dd>{analysis.result.metadata.first_date} — {analysis.result.metadata.last_date}</dd>
                      <dt>Benchmark</dt>
                      <dd>{analysis.result.metadata.benchmark}</dd>
                      {page === 'signals' && (
                        <>
                          <dt>Signal windows</dt>
                          <dd>MA{analysis.result.signals.short_window} / MA{analysis.result.signals.long_window}</dd>
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
    </div>
  );
}
