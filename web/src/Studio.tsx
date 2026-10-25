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
} from 'lucide-react';
import { Brand } from './Auth';
import { Dashboard, defaultLayout, TITLES } from './pages';
import type { BacktestForm } from './pages';
import type { Analysis, Backtest, Layout, Page } from './types';
import { put } from './api';

type Props = {
  page: Page;
  analysis: Analysis;
  backtest: Backtest | null;
  layout: Layout;
  btForm: BacktestForm;
  onClose: () => void;
  onSaved: (layout: Layout) => void;
};
export default function Studio({
  page,
  analysis,
  backtest,
  layout,
  btForm,
  onClose,
  onSaved,
}: Props) {
  const [config, setConfig] = useState(structuredClone(layout.config));
  const [selected, setSelected] = useState(config.order[0]);
  const [viewport, setViewport] = useState('desktop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const changed = JSON.stringify(config) !== JSON.stringify(layout.config);
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
      onSaved(result);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể lưu bố cục.');
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (changed && !window.confirm('Bố cục chưa được lưu. Thoát Studio?')) return;
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
        <button className="icon-button" aria-label="Thoát Studio" onClick={close}>
          <ChevronLeft size={20} />
        </button>
        <Brand />
        <span className="studio-slash">/</span>
        <span className="studio-label">Studio</span>
        <span className="studio-divider" />
        <span className="subtle">Tinh chỉnh góc nhìn của bạn</span>
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
          Xem trước trực tiếp
        </span>
        <button className="button primary" onClick={() => void save()} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : saved && !changed ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}
          <span>{saved && !changed ? 'Đã lưu' : 'Lưu bố cục'}</span>
        </button>
        <button className="icon-button" aria-label="Đóng Studio" onClick={close}>
          <X size={19} />
        </button>
      </header>
      <div className="studio-body">
        <aside className="studio-left">
          <span className="eyebrow">BỐ CỤC TRANG</span>
          <h3>Các thành phần</h3>
          <p>Kéo để đổi thứ tự. Dùng mũi tên nếu bạn đang thao tác bằng bàn phím.</p>
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
                    aria-label={'Đưa ' + TITLES[key] + ' lên'}
                    disabled={i === 0}
                    onClick={() => move(key, -1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={'Đưa ' + TITLES[key] + ' xuống'}
                    disabled={i === config.order.length - 1}
                    onClick={() => move(key, 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    aria-label={(config.hidden.includes(key) ? 'Hiện ' : 'Ẩn ') + TITLES[key]}
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
            Bố cục mặc định
          </button>
          <div className="studio-tip">
            <span className="status-dot" />
            <p>Studio thay đổi trình bày. Dữ liệu và công thức tài chính được giữ nguyên.</p>
          </div>
        </aside>
        <main className="studio-canvas">
          <div className="studio-canvas-label">
            <span>TRANG XEM TRƯỚC</span>
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
              <span className="tag">Xem trước</span>
            </div>
            <div className="studio-preview-heading">
              <span className="eyebrow">PHÂN TÍCH DANH MỤC</span>
              <h2>{analysis.result.metadata.portfolio_name}</h2>
              <p>Bố cục riêng cho góc nhìn của bạn.</p>
            </div>
            <Dashboard
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
          <span className="eyebrow">THUỘC TÍNH WIDGET</span>
          <h3>{TITLES[selected]}</h3>
          <label>
            Tiêu đề
            <input
              maxLength={100}
              value={config.titles[selected] ?? TITLES[selected]}
              onChange={(e) =>
                setConfig({ ...config, titles: { ...config.titles, [selected]: e.target.value } })
              }
            />
          </label>
          <label>
            Hiển thị biểu đồ
            <select
              value={config.chart_style}
              onChange={(e) =>
                setConfig({ ...config, chart_style: e.target.value as 'area' | 'line' })
              }
            >
              <option value="area">Đường và vùng</option>
              <option value="line">Chỉ đường</option>
            </select>
          </label>
          <label>
            Mật độ bố cục
            <select
              value={config.density}
              onChange={(e) =>
                setConfig({ ...config, density: e.target.value as 'comfortable' | 'compact' })
              }
            >
              <option value="comfortable">Thoáng</option>
              <option value="compact">Gọn</option>
            </select>
          </label>
          <div className="studio-property-note">
            <strong>Nguồn dữ liệu</strong>
            <span>{analysis.result.metadata.portfolio_name}</span>
            <span>Phiên bản {analysis.result.metadata.version_number}</span>
            <span>{analysis.result.metadata.is_demo ? 'Giá mô phỏng' : 'Yahoo Finance'}</span>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <div className="studio-save-state">
            {changed ? 'Có thay đổi chưa lưu' : 'Bố cục đã đồng bộ'}
          </div>
        </aside>
      </div>
    </div>
  );
}
