import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Eye,
  GripVertical,
  LayoutTemplate,
  LoaderCircle,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import { Brand } from './Auth';
import { Dashboard, defaultLayout, TITLES } from './pages';
import type { BacktestForm } from './pages';
import type { Analysis, Backtest, Layout, Page } from './types';
import { put } from './api';
import { DEFAULT_MENU, PAGE_LABELS } from './preferences';
import type { ContentLocale, PageContent, Preferences } from './preferences';
import { useDialogFocus } from './useDialogFocus';

type Props = {
  preferences: Preferences;
  onPreferencesSaved: (preferences: Preferences) => void;
  page: Page;
  analysis: Analysis;
  backtest: Backtest | null;
  layout: Layout;
  btForm: BacktestForm;
  defaultContent: PageContent;
  onPageChange: (page: Page) => void;
  onClose: () => void;
  onSaved: (layout: Layout) => void;
};
type InspectorTab = 'content' | 'design' | 'function';
type Viewport = 'desktop' | 'tablet' | 'mobile';
const LOCALES: { id: ContentLocale; label: string }[] = [
  { id: 'en-US', label: '🇺🇸 English · United States' },
  { id: 'vi-VN', label: '🇻🇳 Tiếng Việt · Việt Nam' },
];

export default function Studio({
  preferences,
  onPreferencesSaved,
  page,
  analysis,
  backtest,
  layout,
  btForm,
  defaultContent,
  onPageChange,
  onClose,
  onSaved,
}: Props) {
  const [config, setConfig] = useState(() => structuredClone(layout.config));
  const [settings, setSettings] = useState(() => structuredClone(preferences));
  const [selected, setSelected] = useState<string>('page');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [addingMenu, setAddingMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const studioRef = useRef<HTMLDivElement>(null);
  const changed =
    JSON.stringify(config) !== JSON.stringify(layout.config) ||
    JSON.stringify(settings) !== JSON.stringify(preferences);
  const currentContent = settings.content[page]?.[settings.locale];
  const content = currentContent || defaultContent;
  const isWidget = config.order.includes(selected);
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
  function select(item: string, tab: InspectorTab = 'content') {
    setSelected(item);
    setInspectorTab(tab);
  }
  function move(key: string, offset: number) {
    const order = [...config.order];
    const index = order.indexOf(key);
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setConfig({ ...config, order });
    setSaved(false);
  }
  function drop(source: string, target: string) {
    if (!config.order.includes(source) || source === target) return;
    const order = config.order.filter((key) => key !== source);
    order.splice(order.indexOf(target), 0, source);
    setConfig({ ...config, order });
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
      const result = await put<Layout>('/layouts/' + page, {
        expected_revision: layout.revision,
        config,
      });
      onPreferencesSaved(settings);
      onSaved(result);
      setSaved(true);
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
  useDialogFocus(studioRef, close, 'first');

  return (
    <div
      ref={studioRef}
      className="studio-shell studio-editor"
      role="dialog"
      aria-modal="true"
      aria-label="doFiin Studio"
    >
      <header className="studio-header">
        <button className="icon-button" aria-label="Exit Studio" onClick={close}>
          <ChevronLeft size={20} />
        </button>
        <Brand />
        <span className="studio-slash">/</span>
        <span className="studio-label">Studio</span>
        <span className="studio-header-spacer" />
        <label className="studio-top-select">
          <span>Content language</span>
          <select
            aria-label="Content language"
            value={settings.locale}
            onChange={(event) =>
              setSettings({ ...settings, locale: event.target.value as ContentLocale })
            }
          >
            {LOCALES.map((locale) => (
              <option key={locale.id} value={locale.id}>
                {locale.label}
              </option>
            ))}
          </select>
        </label>
        <label className="studio-top-select studio-page-select">
          <span>Page</span>
          <select
            aria-label="Studio page"
            value={page}
            onChange={(event) => switchPage(event.target.value as Page)}
          >
            {DEFAULT_MENU.map((item) => (
              <option key={item} value={item}>
                {PAGE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <span className={'studio-header-status ' + (changed ? 'unsaved' : '')} role="status">
          {busy ? 'Saving…' : changed ? 'Unsaved changes' : saved ? 'Saved' : 'Up to date'}
        </span>
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
        <aside className="studio-left" aria-label="Studio sections">
          <div className="studio-panel-heading">
            <strong>Sections</strong>
            <span>{PAGE_LABELS[page]}</span>
          </div>
          <div className="studio-tree-group">
            <button
              className={
                'studio-tree-row studio-tree-parent ' + (selected === 'page' ? 'selected' : '')
              }
              onClick={() => select('page')}
            >
              <LayoutTemplate size={16} />
              <span>Page content</span>
            </button>
            {config.order.map((key, index) => (
              <div
                className={
                  'studio-tree-row studio-tree-child ' + (selected === key ? 'selected' : '')
                }
                key={key}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData('application/dofiin-widget', key)
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  drop(event.dataTransfer.getData('application/dofiin-widget'), key);
                }}
              >
                <button className="studio-tree-select" onClick={() => select(key)}>
                  <GripVertical size={14} />
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
                    disabled={index === config.order.length - 1}
                    onClick={() => move(key, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
            ))}
            <button
              className="studio-tree-add"
              onClick={() => {
                setConfig(defaultLayout(page));
                setSaved(false);
                select('page');
              }}
            >
              <RotateCcw size={14} /> Reset page layout
            </button>
          </div>
          <div className="studio-tree-group">
            <div className="studio-tree-caption">NAVIGATION</div>
            {settings.menu.map((item, index) => (
              <div
                className={
                  'studio-tree-row studio-tree-child ' +
                  (selected === 'menu:' + item ? 'selected' : '')
                }
                key={item}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/dofiin-menu', item)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData('application/dofiin-menu') as Page;
                  if (!settings.menu.includes(source) || source === item) return;
                  const menu = settings.menu.filter((key) => key !== source);
                  menu.splice(menu.indexOf(item), 0, source);
                  setSettings({ ...settings, menu });
                }}
              >
                <button className="studio-tree-select" onClick={() => select('menu:' + item)}>
                  <GripVertical size={14} />
                  <span>{PAGE_LABELS[item]}</span>
                </button>
                <div className="studio-tree-actions">
                  <button
                    aria-label={'Move ' + PAGE_LABELS[item] + ' up'}
                    disabled={index === 0}
                    onClick={() => {
                      const menu = [...settings.menu];
                      [menu[index - 1], menu[index]] = [menu[index], menu[index - 1]];
                      setSettings({ ...settings, menu });
                    }}
                  >
                    <ArrowUp size={13} />
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
              <select
                className="studio-add-menu"
                aria-label="Add navigation menu"
                value=""
                onChange={(event) => {
                  const item = event.target.value as Page;
                  setSettings({ ...settings, menu: [...settings.menu, item] });
                  setAddingMenu(false);
                  select('menu:' + item);
                }}
              >
                <option value="" disabled>
                  Select a page
                </option>
                {DEFAULT_MENU.filter((item) => !settings.menu.includes(item)).map((item) => (
                  <option key={item} value={item}>
                    {PAGE_LABELS[item]}
                  </option>
                ))}
              </select>
            )}
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
            Drag sections to reorder. Select an item to edit it.
          </div>
        </aside>
        <main className="studio-canvas">
          <div className="studio-preview-toolbar">
            <div className="studio-preview-path">
              <span className="studio-preview-dot" /> doFiin / {PAGE_LABELS[page]}
            </div>
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
            <span className="studio-preview-live">
              <Eye size={14} /> Live preview
            </span>
          </div>
          <div className="studio-preview-stage">
            <div className={'studio-preview ' + viewport}>
              <div className="studio-preview-brand">
                <Brand />
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
                <h4>Page copy</h4>
                <p>
                  Edit this page in {LOCALES.find((item) => item.id === settings.locale)?.label}.
                  Each language has separate copy; the default appears until you edit it.
                </p>
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
                    <RotateCcw size={14} /> Reset this language
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
                  <div className="studio-settings-section">
                    <h4>Widget layout</h4>
                    <label className="studio-switch-row">
                      <span>Visible in dashboard</span>
                      <input
                        type="checkbox"
                        checked={!config.hidden.includes(selected)}
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            hidden: event.target.checked
                              ? config.hidden.filter((key) => key !== selected)
                              : [...config.hidden, selected],
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                {isMenu && (
                  <div className="studio-settings-section">
                    <h4>Navigation order</h4>
                    <p>Use the arrows or drag the menu items in the section list.</p>
                  </div>
                )}
                <div className="studio-settings-section">
                  <h4>Charts &amp; spacing</h4>
                  <label>
                    Chart type
                    <select
                      value={config.chart_style}
                      onChange={(event) =>
                        setConfig({ ...config, chart_style: event.target.value as 'area' | 'line' })
                      }
                    >
                      <option value="area">Area</option>
                      <option value="line">Line</option>
                    </select>
                  </label>
                  <label>
                    Density
                    <select
                      value={config.density}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          density: event.target.value as 'comfortable' | 'compact',
                        })
                      }
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
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
                  <label>
                    Corner radius
                    <select
                      value={settings.presentation.corners}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          presentation: {
                            ...settings.presentation,
                            corners: Number(event.target.value),
                          },
                        })
                      }
                    >
                      {[0, 4, 8, 12].map((radius) => (
                        <option key={radius} value={radius}>
                          {radius} px
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
            {inspectorTab === 'function' && (
              <div className="studio-settings-section studio-function">
                <h4>Data &amp; rules</h4>
                <p>
                  These values come from your active analysis. Change portfolio holdings and rules
                  from the dashboard.
                </p>
                <dl>
                  <dt>Portfolio</dt>
                  <dd>{analysis.result.metadata.portfolio_name}</dd>
                  <dt>Source</dt>
                  <dd>{analysis.result.metadata.is_demo ? 'Simulated data' : 'Yahoo Finance'}</dd>
                  <dt>Period</dt>
                  <dd>
                    {analysis.result.metadata.first_date} — {analysis.result.metadata.last_date}
                  </dd>
                  <dt>Benchmark</dt>
                  <dd>{analysis.result.metadata.benchmark}</dd>
                  <dt>Signal windows</dt>
                  <dd>
                    MA{analysis.result.signals.short_window} / MA
                    {analysis.result.signals.long_window}
                  </dd>
                </dl>
                <button className="button outline full" onClick={close}>
                  Open dashboard
                </button>
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
