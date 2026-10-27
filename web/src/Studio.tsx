import { useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  GripVertical,
  LoaderCircle,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { Brand } from './Auth';
import { Dashboard, defaultLayout, TITLES } from './pages';
import type { BacktestForm } from './pages';
import type { Analysis, Backtest, Layout, Page } from './types';
import { put } from './api';
import { DEFAULT_MENU, PAGE_LABELS } from './preferences';
import type { Preferences } from './preferences';

type Props = {
  preferences: Preferences;
  onPreferencesSaved: (preferences: Preferences) => void;
  page: Page;
  analysis: Analysis;
  backtest: Backtest | null;
  layout: Layout;
  btForm: BacktestForm;
  onClose: () => void;
  onSaved: (layout: Layout) => void;
};
export default function Studio({
  preferences,
  onPreferencesSaved,
  page,
  analysis,
  backtest,
  layout,
  btForm,
  onClose,
  onSaved,
}: Props) {
  const [config, setConfig] = useState(structuredClone(layout.config));
  const [settings, setSettings] = useState(() => structuredClone(preferences));
  const [tab, setTab] = useState<'appearance' | 'function'>('appearance');
  const [addingMenu, setAddingMenu] = useState(false);
  const [selected, setSelected] = useState(config.order[0]);
  const [viewport, setViewport] = useState('desktop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const changed =
    JSON.stringify(config) !== JSON.stringify(layout.config) ||
    JSON.stringify(settings) !== JSON.stringify(preferences);
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
  async function save() {
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save layout.');
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (changed && !window.confirm('You have unsaved changes. Exit Studio?')) return;
    onClose();
  }
  const studioRef = useRef<HTMLDivElement>(null);
  useDialogFocus(studioRef, close);
  return (
    <div
      ref={studioRef}
      className="studio-shell"
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
        <span className="studio-divider" />
        <span className="subtle">Customize the presentation.</span>
        <div className="viewport-buttons">
          {[
            { key: 'desktop', icon: Monitor, label: 'Desktop' },
            { key: 'tablet', icon: Tablet, label: 'Tablet' },
            { key: 'mobile', icon: Smartphone, label: 'Mobile' },
          ].map((item) => (
            <button
              key={item.key}
              className={viewport === item.key ? 'active' : ''}
              onClick={() => setViewport(item.key)}
            >
              <item.icon size={15} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <span className="button outline studio-preview-button">
          <Eye size={15} />
          Live preview
        </span>
        <button className="button primary" onClick={() => void save()} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : saved && !changed ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}
          <span>{saved && !changed ? 'Saved' : 'Save layout'}</span>
        </button>
        <button className="icon-button" aria-label="Close Studio" onClick={close}>
          <X size={19} />
        </button>
      </header>
      <div className="studio-body">
        <aside className="studio-left">
          <section className="studio-menu" aria-label="Navigation menu settings">
            <h3>Navigation menu</h3>
            {settings.menu.map((item, index) => (
              <div
                className={'studio-menu-row ' + (page === item ? 'active' : '')}
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
                <GripVertical size={14} />
                <span className="studio-menu-name">{PAGE_LABELS[item]}</span>
                <button
                  className="icon-button"
                  aria-label={'Move ' + PAGE_LABELS[item] + ' up'}
                  disabled={index === 0}
                  onClick={() => {
                    const menu = [...settings.menu];
                    [menu[index - 1], menu[index]] = [menu[index], menu[index - 1]];
                    setSettings({ ...settings, menu });
                  }}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Remove ' + PAGE_LABELS[item] + ' menu'}
                  disabled={settings.menu.length === 1}
                  onClick={() =>
                    setSettings({ ...settings, menu: settings.menu.filter((key) => key !== item) })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              className="text-button"
              disabled={settings.menu.length === DEFAULT_MENU.length}
              onClick={() => setAddingMenu(!addingMenu)}
            >
              <Plus size={14} />
              Add Menu
            </button>
            {addingMenu && (
              <select
                aria-label="Add navigation menu"
                value=""
                onChange={(event) => {
                  setSettings({
                    ...settings,
                    menu: [...settings.menu, event.target.value as Page],
                  });
                  setAddingMenu(false);
                }}
              >
                <option value="" disabled>
                  Select a page
                </option>
                {DEFAULT_MENU.filter((key) => !settings.menu.includes(key)).map((key) => (
                  <option key={key} value={key}>
                    {PAGE_LABELS[key]}
                  </option>
                ))}
              </select>
            )}
          </section>
          <span className="eyebrow">PAGE LAYOUT</span>
          <h3>Widgets</h3>
          <p>Drag to reorder, or use the arrow buttons.</p>
          <div className="studio-widgets">
            {config.order.map((key, i) => (
              <div
                className={'studio-widget-item ' + (selected === key ? 'selected' : '')}
                key={key}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(e.dataTransfer.getData('text/plain'), key);
                }}
              >
                <button className="widget-select" onClick={() => setSelected(key)}>
                  <GripVertical size={15} />
                  <span>{config.titles[key] || TITLES[key]}</span>
                </button>
                <div className="widget-controls">
                  <button
                    aria-label={'Move' + TITLES[key] + 'up'}
                    disabled={i === 0}
                    onClick={() => move(key, -1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={'Move' + TITLES[key] + 'down'}
                    disabled={i === config.order.length - 1}
                    onClick={() => move(key, 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    aria-label={(config.hidden.includes(key) ? 'Show' : 'Hide') + TITLES[key]}
                    onClick={() =>
                      setConfig({
                        ...config,
                        hidden: config.hidden.includes(key)
                          ? config.hidden.filter((item) => item !== key)
                          : [...config.hidden, key],
                      })
                    }
                  >
                    {config.hidden.includes(key) ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="button outline full"
            onClick={() => {
              setConfig(defaultLayout(page));
              setSaved(false);
            }}
          >
            <RotateCcw size={14} />
            Reset layout
          </button>
          <div className="studio-tip">
            <span className="status-dot" />
            <p>Customize the presentation. Data and formulas stay the same.</p>
          </div>
        </aside>
        <main className="studio-canvas">
          <div className="studio-canvas-label">
            <span>PAGE PREVIEW</span>
            <span>
              {viewport === 'desktop'
                ? 'Desktop · Responsive'
                : viewport === 'tablet'
                  ? 'Tablet · 834 px'
                  : 'Mobile · 390 px'}
            </span>
          </div>
          <div className={'studio-preview ' + viewport}>
            <div className="studio-preview-brand">
              <Brand />
              <span className="tag">Preview</span>
            </div>
            <div className="studio-preview-heading">
              <span className="eyebrow">PORTFOLIO ANALYTICS</span>
              <h2>{analysis.result.metadata.portfolio_name}</h2>
              <p>Your portfolio page layout.</p>
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
        </main>
        <aside className="studio-right">
          <div className="studio-tabs" role="tablist" aria-label="Widget settings">
            <button
              role="tab"
              id="appearance-tab"
              aria-controls="appearance-panel"
              aria-selected={tab === 'appearance'}
              onClick={() => setTab('appearance')}
            >
              Appearance
            </button>
            <button
              role="tab"
              id="function-tab"
              aria-controls="function-panel"
              aria-selected={tab === 'function'}
              onClick={() => setTab('function')}
            >
              Function
            </button>
          </div>
          {tab === 'appearance' ? (
            <div role="tabpanel" id="appearance-panel" aria-labelledby="appearance-tab">
              <span className="eyebrow">WIDGET SETTINGS</span>
              <h3>{TITLES[selected]}</h3>
              <label>
                Title
                <input
                  maxLength={100}
                  value={config.titles[selected] ?? TITLES[selected]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      titles: { ...config.titles, [selected]: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Chart type
                <select
                  value={config.chart_style}
                  onChange={(e) =>
                    setConfig({ ...config, chart_style: e.target.value as 'area' | 'line' })
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
                  onChange={(e) =>
                    setConfig({ ...config, density: e.target.value as 'comfortable' | 'compact' })
                  }
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <div className="studio-property-note">
                <strong>Data source</strong>
                <span>{analysis.result.metadata.portfolio_name}</span>
                <span>Version {analysis.result.metadata.version_number}</span>
                <span>
                  {analysis.result.metadata.is_demo ? 'Simulated prices' : 'Yahoo Finance'}
                </span>
              </div>
              <label>
                Chart color
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
              </label>
              <label>
                Legend
                <select
                  aria-label="Legend"
                  value={String(settings.presentation.legend)}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      presentation: {
                        ...settings.presentation,
                        legend: event.target.value === 'true',
                      },
                    })
                  }
                >
                  <option value="true">Visible</option>
                  <option value="false">Hidden</option>
                </select>
              </label>
              <label>
                Corner radius
                <select
                  aria-label="Corner radius"
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
              <p className="small-note">Manage portfolio data, periods, and rules in Function.</p>
            </div>
          ) : (
            <div
              className="studio-function"
              role="tabpanel"
              id="function-panel"
              aria-labelledby="function-tab"
            >
              <h3>Data &amp; rules</h3>
              <p>
                Appearance changes presentation. Portfolio data and analysis rules are managed from
                your dashboard.
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
                  MA{analysis.result.signals.short_window} / MA{analysis.result.signals.long_window}
                </dd>
              </dl>
              <button className="button outline full" onClick={close}>
                Open dashboard
              </button>
            </div>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <div className="studio-save-state">{changed ? 'Unsaved changes' : 'Layout synced'}</div>
        </aside>
      </div>
    </div>
  );
}
