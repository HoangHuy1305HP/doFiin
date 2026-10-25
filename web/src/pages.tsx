import type { ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleHelp,
  FlaskConical,
  Lightbulb,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AllocationChart, COLORS, FactorChart, TimeChart } from './charts';
import { dateLabel, money, number, percent } from './api';
import type { Analysis, Backtest, LayoutConfig, Page } from './types';

export const TITLES: Record<string, string> = {
  growth: 'Tăng trưởng tích lũy',
  allocation: 'Phân bổ danh mục',
  assets: 'Từng tài sản, một góc nhìn',
  insight: 'Góc nhìn từ dữ liệu',
  drawdown: 'Drawdown theo thời gian',
  correlation: 'Tương quan giữa các mã',
  volatility: 'Biến động theo thời gian',
  risk_note: 'Đọc rủi ro trong bối cảnh',
  moving_average: 'Giao cắt trung bình động',
  signal_history: 'Các trạng thái gần đây',
  signal_note: 'Tín hiệu được tạo như thế nào?',
  backtest_growth: 'Chiến lược và thị trường',
  backtest_trades: 'Lịch sử giao dịch giả lập',
  backtest_note: 'Những giả định cần biết',
  beta: 'Mức nhạy với thị trường',
  momentum: 'Động lượng 12–1',
  factor_table: 'Các yếu tố theo tài sản',
  factor_note: 'Hiểu yếu tố phía sau lợi nhuận',
};
export const ORDERS: Record<Page, string[]> = {
  portfolio: ['growth', 'allocation', 'assets', 'insight'],
  risk: ['drawdown', 'correlation', 'volatility', 'risk_note'],
  signals: ['moving_average', 'signal_history', 'signal_note'],
  backtest: ['backtest_growth', 'backtest_trades', 'backtest_note'],
  factors: ['beta', 'momentum', 'factor_table', 'factor_note'],
};
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
  btStale = false,
}: Props) {
  const { metrics: m, series, factors, signals, correlation, metadata } = analysis.result;
  const primary = layout.chart_style === 'area';
  const widgets: Record<string, ReactNode> = {};
  widgets.growth = (
    <>
      <div className="chart-topline">
        <div>
          <span className="micro-label">GIÁ TRỊ CHUẨN HÓA</span>
          <strong>
            100 <span>tại đầu kỳ</span>
          </strong>
        </div>
        <Legend
          items={[
            { name: 'Danh mục', color: '#245947' },
            { name: 'SPY', color: '#adbd8d' },
          ]}
        />
      </div>
      <TimeChart
        data={series}
        lines={[
          { key: 'portfolio', name: 'Danh mục', color: '#245947' },
          { key: 'benchmark', name: 'SPY', color: '#adbd8d' },
        ]}
        area={primary}
      />
      <div className="chart-foot">
        <span>{dateLabel(metadata.first_date)}</span>
        <span>{dateLabel(metadata.last_date)}</span>
      </div>
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
      </div>
      <div className="small-note">Tỷ trọng mục tiêu tại đầu kỳ</div>
    </>
  );
  widgets.assets = (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tài sản</th>
              <th>Tỷ trọng đầu kỳ</th>
              <th>Lợi nhuận trong kỳ</th>
              <th>Biến động năm hóa</th>
              <th>Beta / SPY</th>
            </tr>
          </thead>
          <tbody>
            {factors.map((asset, i) => (
              <tr key={asset.symbol}>
                <td>
                  <span className="asset-symbol">
                    <span className={'asset-icon asset-' + i}>{asset.symbol.slice(0, 1)}</span>
                    <span>
                      <strong>{asset.symbol}</strong>
                      <small>
                        {asset.symbol === 'AAPL'
                          ? 'Apple Inc.'
                          : asset.symbol === 'MSFT'
                            ? 'Microsoft'
                            : asset.symbol === 'NVDA'
                              ? 'NVIDIA'
                              : 'ETF · Thị trường Mỹ'}
                      </small>
                    </span>
                  </span>
                </td>
                <td>{percent(asset.weight, 0)}</td>
                <td className={(asset.period_return ?? 0) >= 0 ? 'positive' : 'negative'}>
                  {(asset.period_return ?? 0) > 0 ? '+' : ''}
                  {percent(asset.period_return)}
                </td>
                <td>{percent(asset.volatility)}</td>
                <td>{number(asset.beta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>{factors.length} tài sản · USD</span>
        <button className="text-button" disabled={preview} onClick={onOptimize}>
          <Sparkles size={14} />
          Thử tối ưu Sharpe
          <ArrowUpRight size={14} />
        </button>
      </div>
    </>
  );
  widgets.insight = (
    <div className="insight-content">
      <div className="insight-icon">
        <Lightbulb size={23} />
      </div>
      <div>
        <span className="eyebrow light">MỘT GÓC NHÌN THÊM</span>
        <h3>Lợi nhuận chỉ là một phần câu chuyện.</h3>
        <p>
          Danh mục {m.excess_return != null && m.excess_return >= 0 ? 'vượt' : 'thấp hơn'} benchmark{' '}
          {percent(Math.abs(m.excess_return ?? 0))} trong kỳ. Khám phá thêm mức giảm từ đỉnh và độ
          biến động để hiểu hành trình phía sau con số.
        </p>
      </div>
      <svg className="insight-art" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        {[0, 12, 24, 36, 48].map((n) => (
          <path
            key={n}
            d={'M' + (10 + n / 2) + ' ' + (100 - n / 2) + ' L100 ' + (10 + n / 2) + ' L100 100 Z'}
            stroke="#cfe89b"
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
          <span className="micro-label">MỨC GIẢM SÂU NHẤT</span>
          <strong className="negative">{percent(m.max_drawdown)}</strong>
        </div>
        <span className="subtle">Tính từ đỉnh gần nhất</span>
      </div>
      <TimeChart
        data={series}
        lines={[{ key: 'drawdown', name: 'Drawdown', color: '#54755c' }]}
        kind="percent"
        area={primary}
      />
    </>
  );
  widgets.correlation = (
    <>
      <p className="card-description">Mức độ các tài sản cùng chuyển động, từ −1 đến +1.</p>
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
                        ? '#f1f3ec'
                        : v < 0
                          ? '#e5d4c8'
                          : 'rgba(27,76,57,' + (0.14 + Math.abs(v) * 0.86) + ')',
                    color: v != null && v > 0.55 ? '#fff' : '#244936',
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
        <span>Ít tương quan</span>
        <i />
        <span>Cùng chiều</span>
      </div>
    </>
  );
  widgets.volatility = (
    <>
      <Legend items={[{ name: 'Volatility 20 phiên', color: '#245947' }]} />
      <TimeChart
        data={series}
        lines={[{ key: 'volatility', name: 'Biến động năm hóa', color: '#245947' }]}
        kind="percent"
        height={225}
        area={primary}
      />
    </>
  );
  widgets.risk_note = (
    <div className="explanation">
      <span className="note-icon">
        <CircleHelp size={20} />
      </span>
      <div>
        <h4>Rủi ro, nhìn từ nhiều góc.</h4>
        <p>
          Volatility cho biết độ dao động; drawdown cho biết mức giảm từ đỉnh. Beta {number(m.beta)}{' '}
          mô tả độ nhạy với SPY trong khoảng đã chọn. Các chỉ số này không dự báo được mức lỗ tối đa
          trong tương lai.
        </p>
        <small>
          Risk-free rate: {percent(metadata.risk_free_rate)} / năm · Quy ước 252 phiên / năm.
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
            ? 'Xu hướng tăng'
            : signals.current === 'BEARISH'
              ? 'Xu hướng giảm'
              : 'Trung tính'}
        </span>
        <Legend
          items={[
            { name: 'MA' + signals.short_window, color: '#245947' },
            { name: 'MA' + signals.long_window, color: '#b0bf8c' },
          ]}
        />
      </div>
      <TimeChart
        data={series}
        lines={[
          { key: 'ma_short', name: 'MA' + signals.short_window, color: '#245947' },
          { key: 'ma_long', name: 'MA' + signals.long_window, color: '#b0bf8c' },
        ]}
        area={false}
        height={320}
      />
      <div className="small-note">
        Chỉ số được chuẩn hóa cùng danh mục. Tín hiệu mô tả bối cảnh, không phải lệnh giao dịch.
      </div>
    </>
  );
  widgets.signal_history = (
    <div className="signal-history">
      {signals.history.map((item) => (
        <div key={item.date}>
          <span>{dateLabel(item.date)}</span>
          <span className={'signal-badge ' + item.state.toLowerCase()}>
            {item.state === 'BULLISH' ? 'Tăng' : item.state === 'BEARISH' ? 'Giảm' : 'Trung tính'}
          </span>
        </div>
      ))}
    </div>
  );
  widgets.signal_note = (
    <div className="explanation">
      <TrendingUp size={22} />
      <div>
        <h4>Quy tắc rõ ràng, diễn giải nhất quán.</h4>
        <p>
          Trạng thái tăng khi MA{signals.short_window} cao hơn MA{signals.long_window} trên 0,5%;
          giảm khi thấp hơn trên 0,5%; phần còn lại là trung tính. Kiểm thử MA crossover dùng giao
          cắt trực tiếp và thực thi ở phiên sau.
        </p>
      </div>
    </div>
  );
  widgets.beta = (
    <>
      <p className="card-description">Beta theo từng tài sản so với SPY trong kỳ đã chọn.</p>
      <FactorChart factors={factors} metric="beta" />
      <div className="small-note">Beta &gt; 1: nhạy hơn benchmark · Beta &lt; 1: ít nhạy hơn</div>
    </>
  );
  widgets.momentum = (
    <>
      <p className="card-description">Biến động giá 12 tháng, bỏ qua tháng gần nhất.</p>
      <FactorChart factors={factors} metric="momentum" />
      <div className="small-note">
        Cần ít nhất 253 phiên lịch sử, bao gồm phần dữ liệu khởi tạo.
      </div>
    </>
  );
  widgets.factor_table = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tài sản</th>
            <th>Beta / SPY</th>
            <th>Momentum 12–1</th>
            <th>Vai trò trong danh mục</th>
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
                  ? 'Chưa đủ dữ liệu'
                  : asset.beta > 1
                    ? 'Nhạy với biến động thị trường'
                    : 'Độ nhạy thấp hơn thị trường'}
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
        <h4>Yếu tố giúp đọc câu chuyện phía sau.</h4>
        <p>
          Đây là phân tích mô tả beta thị trường và momentum, chưa phải mô hình hồi quy đa yếu tố.
          CAPM alpha được tách riêng với lợi nhuận vượt benchmark để tránh diễn giải nhầm.
        </p>
        <small>
          CAPM alpha năm hóa: {percent(m.capm_alpha)} · Lợi nhuận vượt SPY:{' '}
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
          { name: 'Chiến lược sau chi phí', color: '#245947' },
          { name: 'SPY chưa trừ phí', color: '#b0bf8c' },
        ]}
      />
      <TimeChart
        data={b.series}
        lines={[
          { key: 'strategy', name: 'Chiến lược', color: '#245947' },
          { key: 'benchmark', name: 'SPY', color: '#b0bf8c' },
        ]}
        kind="money"
        area={primary}
        height={310}
      />
    </>
  ) : (
    <div className="empty-chart">
      <FlaskConical size={32} />
      <h4>Thử một quy tắc trong quá khứ.</h4>
      <p>Chọn cấu hình và chạy kiểm thử để xem kết quả.</p>
      <button className="button primary" onClick={onBacktest} disabled={btBusy}>
        <Play size={15} />
        Chạy kiểm thử
      </button>
    </div>
  );
  widgets.backtest_trades = b ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ngày thực hiện</th>
            <th>Hành động</th>
            <th>Giá trị giao dịch</th>
            <th>Tổng chi phí</th>
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
                      ? 'Phân bổ vốn'
                      : trade.action === 'CASH'
                        ? 'Về tiền mặt'
                        : 'Tái cân bằng'}
                  </span>
                </td>
                <td>{money(trade.turnover)}</td>
                <td>{money(trade.cost)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {!b.trades.length && <p className="small-note">Không có giao dịch trong khoảng đã chọn.</p>}
      <div className="small-note">
        Tối đa 15 giao dịch gần nhất trên giao diện · Đầy đủ trong bản xuất CSV.
      </div>
    </div>
  ) : (
    <p className="card-description">Lịch sử sẽ xuất hiện sau khi kiểm thử hoàn tất.</p>
  );
  widgets.backtest_note = (
    <div className="explanation">
      <CircleHelp size={22} />
      <div>
        <h4>Kiểm thử là một giả lập có điều kiện.</h4>
        <p>
          Tín hiệu dùng thông tin cuối phiên trước, khớp tại giá đóng cửa phiên tiếp theo. Phí và
          slippage áp dụng trên giá trị mua/bán; không short, không vay vốn. Kết quả quá khứ không
          bảo đảm hiệu suất tương lai.
        </p>
      </div>
    </div>
  );
  let metrics: ReactNode;
  if (page === 'risk')
    metrics = (
      <>
        <Metric
          label="Biến động năm hóa"
          value={percent(m.annualized_volatility)}
          detail="Độ lệch chuẩn lợi nhuận ngày"
        />
        <Metric
          label="Drawdown lớn nhất"
          value={percent(m.max_drawdown)}
          detail="Mức giảm từ đỉnh trong kỳ"
          positive={false}
        />
        <Metric label="Beta so với SPY" value={number(m.beta)} detail="Độ nhạy với thị trường" />
        <Metric
          label="Sharpe ratio"
          value={number(m.sharpe_ratio)}
          detail="Lợi nhuận vượt lãi suất / rủi ro"
        />
      </>
    );
  else if (page === 'factors')
    metrics = (
      <>
        <Metric label="Beta danh mục" value={number(m.beta)} detail="So với SPY trong kỳ" />
        <Metric
          label="Momentum 12–1"
          value={percent(analysis.result.momentum_12_1)}
          detail="Bỏ qua tháng gần nhất"
        />
        <Metric
          label="CAPM alpha năm hóa"
          value={percent(m.capm_alpha)}
          detail="Sau điều chỉnh beta thị trường"
        />
        <Metric
          label="Tài sản phân tích"
          value={String(factors.length)}
          detail="Cùng nguồn và lịch dữ liệu"
        />
      </>
    );
  else if (page === 'signals')
    metrics = (
      <>
        <Metric
          label="Trạng thái hiện tại"
          value={
            signals.current === 'BULLISH'
              ? 'Tăng'
              : signals.current === 'BEARISH'
                ? 'Giảm'
                : 'Trung tính'
          }
          detail="Theo chênh lệch MA 0,5%"
          positive={signals.current === 'BULLISH' ? true : undefined}
        />
        <Metric
          label="MA ngắn hạn"
          value={number(series.at(-1)?.ma_short as number)}
          detail={signals.short_window + ' phiên · Chỉ số chuẩn hóa'}
        />
        <Metric
          label="MA dài hạn"
          value={number(series.at(-1)?.ma_long as number)}
          detail={signals.long_window + ' phiên · Chỉ số chuẩn hóa'}
        />
        <Metric
          label="Ngày dữ liệu cuối"
          value={metadata.last_date.slice(8) + '/' + metadata.last_date.slice(5, 7)}
          detail={metadata.last_date.slice(0, 4) + ' · Cùng bộ dữ liệu danh mục'}
        />
      </>
    );
  else if (page === 'backtest')
    metrics = (
      <>
        <Metric
          label="Lợi nhuận chiến lược"
          value={percent(b?.metrics.total_return)}
          detail="Đã trừ phí và slippage"
          positive={(b?.metrics.total_return ?? 0) >= 0}
        />
        <Metric
          label="Giá trị cuối kỳ"
          value={money(b?.metrics.final_value)}
          detail="Từ vốn mô phỏng đã chọn"
        />
        <Metric
          label="Drawdown lớn nhất"
          value={percent(b?.metrics.max_drawdown)}
          detail="Tính cả chi phí giao dịch"
          positive={false}
        />
        <Metric
          label="Tổng chi phí"
          value={money(b?.metrics.total_cost)}
          detail={String(b?.metrics.trade_count ?? 0) + ' lần giao dịch giả lập'}
        />
      </>
    );
  else
    metrics = (
      <>
        <Metric
          label="Lợi nhuận danh mục"
          value={percent(m.total_return)}
          detail="Lũy kế trong khoảng đã chọn"
          positive={(m.total_return ?? 0) >= 0}
        />
        <Metric
          label="So với benchmark"
          value={
            (m.excess_return ?? 0) >= 0 ? '+' + percent(m.excess_return) : percent(m.excess_return)
          }
          detail="Chênh lệch với SPY"
          positive={(m.excess_return ?? 0) >= 0}
        />
        <Metric
          label="Sharpe ratio"
          value={number(m.sharpe_ratio)}
          detail="Lợi nhuận trên một đơn vị rủi ro"
        />
        <Metric
          label="Drawdown lớn nhất"
          value={percent(m.max_drawdown)}
          detail="Mức giảm từ đỉnh trong kỳ"
          positive={false}
        />
      </>
    );
  return (
    <div className={'dashboard ' + (layout.density === 'compact' ? 'compact' : '')}>
      {page === 'backtest' && !preview && (
        <div className="backtest-config">
          <div className="config-intro">
            <FlaskConical size={18} />
            <div>
              <strong>Cấu hình kiểm thử</strong>
              <span>Cùng dữ liệu với lần phân tích hiện tại</span>
            </div>
          </div>
          <div className="backtest-fields">
            <label>
              Chiến lược
              <select
                value={btForm.strategy}
                onChange={(e) => setBtForm({ ...btForm, strategy: e.target.value })}
              >
                <option value="MA_CROSSOVER">Giao cắt MA 20 / 50</option>
                <option value="BUY_AND_HOLD">Mua và nắm giữ</option>
              </select>
            </label>
            <label>
              Vốn ban đầu (USD)
              <input
                type="number"
                min={100}
                max={1e9}
                value={btForm.initial_capital}
                onChange={(e) => setBtForm({ ...btForm, initial_capital: Number(e.target.value) })}
              />
            </label>
            <label>
              Phí (bps)
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
              Tái cân bằng
              <select
                value={btForm.rebalance_frequency}
                onChange={(e) => setBtForm({ ...btForm, rebalance_frequency: e.target.value })}
              >
                <option value="MONTHLY">Hàng tháng</option>
                <option value="NONE">Không định kỳ</option>
              </select>
            </label>
            <button className="button primary" disabled={btBusy} onClick={onBacktest}>
              <Play size={14} />
              {btBusy ? 'Đang kiểm thử…' : 'Chạy kiểm thử'}
            </button>
          </div>
          {btStale && (
            <p className="small-note warning-text">
              Cấu hình đã thay đổi. Chạy lại để cập nhật kết quả. 100 bps = 1%.
            </p>
          )}
        </div>
      )}
      <div className="metrics-strip">{metrics}</div>
      <div className="widgets-grid">
        {layout.order
          .filter((key) => !layout.hidden.includes(key))
          .map((key) => (
            <section
              className={'widget widget-' + key + (key === 'insight' ? ' dark-widget' : '')}
              key={key}
              aria-label={layout.titles[key] || TITLES[key]}
            >
              {key !== 'insight' && (
                <div className="widget-heading">
                  <div>
                    <span className="widget-eyebrow">
                      {key === 'allocation'
                        ? 'CƠ CẤU'
                        : key === 'growth'
                          ? 'HIỆU SUẤT'
                          : page === 'portfolio'
                            ? 'DANH MỤC'
                            : page === 'risk'
                              ? 'PHÂN TÍCH RỦI RO'
                              : page === 'signals'
                                ? 'TÍN HIỆU'
                                : page === 'factors'
                                  ? 'YẾU TỐ'
                                  : 'KIỂM THỬ'}
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
          <p>Tất cả widget đang ẩn. Mở Studio để hiển thị lại.</p>
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
