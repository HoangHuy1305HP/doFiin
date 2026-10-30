import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dateLabel, number, percent, post } from './api';
import { TimeChart } from './charts';
import type { Backtest, Point } from './types';

type Research = {
  factors: {symbol: string; beta: number | null; observations: number; source: string}[];
  rolling: Point[]; asset_betas: {symbol: string; beta: number | null}[];
  beta_heatmap: {symbols: string[]; dates: string[]; values: (number | null)[][]};
  regimes: {date: string; price: number; score: number | null; state: string; ready: boolean}[];
  market_status: string; treynor: number | null; spy_alpha: number | null;
  sources: Record<string, string>; warnings: string[]; methodology: string;
};
export function useResearch(runId: string, enabled: boolean) {
  const [state, setState] = useState<{id: string; data: Research | null; error: string}>({id: '', data: null, error: ''});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState({id: runId, data: null, error: ''});
    post<Research>(`/analysis-runs/${runId}/research`, {}).then((data) => {
      if (active) setState({id: runId, data, error: ''});
    }).catch((error) => {
      if (active) setState({id: runId, data: null, error: error instanceof Error ? error.message : 'Chưa tải được dữ liệu yếu tố.'});
    });
    return () => { active = false; };
  }, [runId, enabled, retry]);
  return {data: state.id === runId ? state.data : null, error: state.id === runId ? state.error : '',
    retry: () => setRetry((value) => value + 1)};
}

export function ReturnHistogram({data}: {data: {return: number; count: number; lower: number; upper: number}[]}) {
  return <>
    <p className="card-description">Trục ngang là lợi nhuận một ngày; chiều cao cột là số phiên rơi vào khoảng đó. Đây là thống kê lịch sử, không giả định phân phối chuẩn.</p>
    <ResponsiveContainer width="100%" height={260}><BarChart data={data}>
      <CartesianGrid vertical={false} strokeDasharray="3 5" />
      <XAxis dataKey="return" tickFormatter={(v) => percent(v, 1)} minTickGap={20} tick={{fontSize: 11}} />
      <YAxis allowDecimals={false} width={40} tick={{fontSize: 11}} />
      <Tooltip labelFormatter={(v) => `Lợi nhuận ${percent(Number(v))}`} formatter={(v) => [`${v} phiên`, 'Tần suất']} />
      <Bar dataKey="count" name="Số phiên" fill="#365c52" isAnimationActive={false} />
    </BarChart></ResponsiveContainer>
  </>;
}

export function ResearchWidget({kind, state, backtest}: {kind: string; state: ReturnType<typeof useResearch>; backtest?: Backtest | null}) {
  const data = state.data;
  if (!data) return <div className="simulation-message" role={state.error ? 'alert' : 'status'}>
    {state.error || 'Đang tải SPY, QQQ, IWM và chỉ số VIX…'}
    {state.error && <button type="button" onClick={state.retry}>Thử lại</button>}
  </div>;
  if (kind === 'proxy_factors') return <>
    <p className="card-description">Mỗi Beta được tính riêng với từng biến đại diện, không phải hồi quy nhiều yếu tố đồng thời. VIX là chỉ số, không phải tài sản được mua trong danh mục.</p>
    <ResponsiveContainer width="100%" height={230}><BarChart data={data.factors}>
      <CartesianGrid vertical={false} strokeDasharray="3 5" /><XAxis dataKey="symbol" /><YAxis width={45} />
      <Tooltip formatter={(v) => [number(Number(v)), 'Beta']} /><Bar dataKey="beta" name="Beta" fill="#365c52" isAnimationActive={false} />
    </BarChart></ResponsiveContainer>
    <div className="research-metrics"><span>Alpha CAPM / SPY <strong>{percent(data.spy_alpha)}</strong></span>
      <span>Treynor / SPY <strong>{number(data.treynor)}</strong></span>
      <span>Môi trường <strong>{data.market_status === 'RISK_ON' ? 'Ưa rủi ro' : data.market_status === 'RISK_OFF' ? 'Phòng thủ' : 'Thiếu dữ liệu'}</strong></span></div>
    <div className="table-wrap"><table><thead><tr><th>Biến đại diện</th><th>Beta</th><th>Số phiên</th><th>Nguồn</th></tr></thead>
      <tbody>{data.factors.map((row) => <tr key={row.symbol}><td>{row.symbol}</td><td>{number(row.beta)}</td><td>{row.observations}</td><td>{row.source}</td></tr>)}</tbody></table></div>
    <details className="small-note"><summary>Giả định và tình trạng dữ liệu</summary><ul>{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>
    <p className="small-note">Treynor = lợi nhuận vượt mức phi rủi ro năm hóa / Beta SPY; không diễn giải khi Beta ≤ 0. Môi trường ưa rủi ro khi SPY và QQQ trên MA200, đồng thời VIX &lt; 20.</p>
  </>;
  if (kind === 'factor_rolling') return <>
    <h4>Beta 20 phiên so với SPY</h4><TimeChart data={data.rolling} area={false} lines={[{key: 'beta', name: 'Beta / SPY', color: '#365c52'}]} height={210} />
    <h4>Mức liên hệ với động lượng SPY</h4><TimeChart data={data.rolling} area={false} lines={[{key: 'momentum_exposure', name: 'Tương quan cuốn chiếu', color: '#64748b'}]} height={210} />
    <p className="small-note">Tương quan 20 phiên giữa lợi nhuận danh mục và động lượng SPY 12 phiên. Khác momentum 12–1 tháng của từng cổ phiếu. Khoảng trống nghĩa là chưa đủ dữ liệu.</p>
    <h4>Alpha CAPM cuốn chiếu 20 phiên</h4><TimeChart data={data.rolling} area={false} kind="percent" lines={[{key: 'alpha', name: 'Alpha năm hóa / SPY', color: '#b7791f'}]} height={210} />
  </>;
  if (kind === 'active_return') return <>
    <p className="card-description">Mức tăng trưởng tương đối = chỉ số danh mục / chỉ số SPY − 1. Dương nghĩa là danh mục tăng trưởng tốt hơn SPY từ đầu kỳ; đây không phải Alpha CAPM.</p>
    <TimeChart data={data.rolling} kind="percent" lines={[{key: 'relative_return', name: 'Tăng trưởng tương đối / SPY', color: '#365c52'}]} />
  </>;
  if (kind === 'beta_heatmap') return <>
    <p className="card-description">Beta từng cổ phiếu so với SPY, cửa sổ 60 phiên. Màu đậm thể hiện độ lớn; ô trống chưa đủ dữ liệu. Rê chuột để xem ngày và giá trị.</p>
    <div className="research-heatmap" style={{gridTemplateColumns: `70px repeat(${data.beta_heatmap.dates.length}, minmax(12px, 1fr))`}}>
      {data.beta_heatmap.symbols.map((symbol, i) => <div className="research-heatmap-row" key={symbol}><strong>{symbol}</strong>
        {data.beta_heatmap.values[i].map((value, j) => <span key={j} title={`${symbol} · ${data.beta_heatmap.dates[j]} · Beta ${number(value)}`}
          style={{background: value == null ? '#f1f5f9' : value < 0 ? `rgba(183,121,31,${Math.min(1, 0.15 + Math.abs(value) / 3)})` : `rgba(22,61,50,${Math.min(1, 0.15 + Math.abs(value) / 3)})`}} />)}
      </div>)}
    </div>
    <p className="small-note">{data.beta_heatmap.dates[0]} → {data.beta_heatmap.dates.at(-1)} · Cam: Beta âm; xanh: Beta dương.</p>
    <div className="table-wrap"><table><thead><tr><th>Xếp hạng Beta cuối kỳ</th><th>Cổ phiếu</th><th>Beta 60 phiên</th></tr></thead>
      <tbody>{data.asset_betas.map((row, i) => <tr key={row.symbol}><td>{row.beta == null ? 'Chưa đủ dữ liệu' : i + 1}</td><td>{row.symbol}</td><td>{number(row.beta)}</td></tr>)}</tbody></table></div>
  </>;
  const history = backtest?.result.regime_history || [];
  const rows: Point[] = data.regimes.map((row) => ({date: row.date, score: row.score,
    bull: row.state === 'BULL' ? row.price : null, bear: row.state === 'BEAR' ? row.price : null,
    neutral: row.state === 'NEUTRAL' ? row.price : null}));
  return <>
    <p className="card-description">{data.methodology}</p>
    <TimeChart data={rows} curve="stepAfter" kind="number" area={false} lines={[{key: 'score', name: 'Điểm thị trường', color: '#365c52'}]} height={230} />
    <h4>Giá SPY theo trạng thái</h4>
    <TimeChart data={rows} area={false} showDots lines={[{key: 'bull', name: 'Tăng', color: '#15803d'}, {key: 'neutral', name: 'Trung tính', color: '#b7791f'}, {key: 'bear', name: 'Giảm', color: '#b91c1c'}]} height={240} />
    <p className="small-note">Trạng thái quan sát ở cuối phiên; chiến lược dùng trạng thái phiên trước để giao dịch phiên sau. Vùng chưa đủ 200 phiên dùng trạng thái trung tính.</p>
    <div className="table-wrap"><table><thead><tr><th>Ngày thực hiện</th><th>Trạng thái dùng</th><th>Ngày thông tin</th></tr></thead>
      <tbody>{history.slice(-12).reverse().map((row) => <tr key={row.date}><td>{dateLabel(row.date)}</td><td>{row.state === 'BULL' ? 'Tăng' : row.state === 'BEAR' ? 'Giảm' : 'Trung tính'}</td><td>{row.decision_date || '—'}</td></tr>)}</tbody></table></div>
    {!history.length && <p className="small-note">Chọn chiến lược chuyển trạng thái và chạy kiểm thử để xem lịch quyết định giao dịch.</p>}
  </>;
}
