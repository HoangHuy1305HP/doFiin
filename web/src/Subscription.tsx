import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CreditCard,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import { api, put } from './api';
import type { Subscription as SubscriptionData } from './types';

const currency = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + 'đ';
export default function Subscription({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<SubscriptionData>('/subscription')
      .then((d) => {
        setData(d);
        setCycle(d.billing_cycle);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function choose(code: string) {
    setBusy(code);
    setError('');
    try {
      const result = await put<SubscriptionData>('/subscription/demo', {
        plan_code: code,
        billing_cycle: cycle,
      });
      setData(result);
      notify('Đã đổi gói mô phỏng. Không phát sinh thanh toán.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đổi gói.');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">GÓI DỊCH VỤ</span>
          <h1>
            Thêm góc nhìn.
            <br className="mobile-only" /> Thêm chủ động.
          </h1>
          <p>Chọn một nhịp phù hợp cho hành trình đầu tư của bạn.</p>
        </div>
        <span className="demo-outline">
          <CreditCard size={15} />
          Bản minh họa
        </span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="current-plan">
        <span className="current-plan-icon">
          <CircleCheck size={24} />
        </span>
        <div>
          <span className="micro-label">GÓI ĐANG SỬ DỤNG</span>
          <strong>
            {data?.plans.find((p) => p.code === data.plan_code)?.name || '…'} ·{' '}
            {data?.plan_code === 'free' ? 'Miễn phí' : 'Mô phỏng'}
          </strong>
          <span>
            {data?.portfolio_count ?? 0} danh mục đang hoạt động trong không gian của bạn.
          </span>
        </div>
        <span className="tag">TẤT CẢ CÔNG CỤ ĐANG MỞ TRONG DEMO</span>
      </div>
      <div className="billing-switch">
        <div className="segmented">
          <button
            className={cycle === 'monthly' ? 'active' : ''}
            onClick={() => setCycle('monthly')}
          >
            Hàng tháng
          </button>
          <button className={cycle === 'annual' ? 'active' : ''} onClick={() => setCycle('annual')}>
            Hàng năm
          </button>
        </div>
        <span className="saving-tag">Tiết kiệm 20%</span>
      </div>
      <div className="plans-grid">
        {data?.plans.map((plan) => (
          <section
            className={'plan-card ' + (plan.code === 'plus' ? 'featured' : '')}
            key={plan.code}
          >
            <div className="plan-card-top">
              <h2>{plan.name}</h2>
              {plan.code === 'plus' && (
                <span className="saving-tag">
                  <Sparkles size={11} />
                  Phổ biến
                </span>
              )}
            </div>
            <p>
              {plan.code === 'free'
                ? 'Bắt đầu với sự rõ ràng.'
                : plan.code === 'plus'
                  ? 'Đủ sâu để hiểu mình hơn.'
                  : 'Thêm chiều sâu cho mọi góc nhìn.'}
            </p>
            <div className="plan-price">
              {currency(
                cycle === 'monthly'
                  ? plan.monthly_price
                  : Math.round(plan.monthly_price * 12 * 0.8),
              )}
              <span>/{cycle === 'monthly' ? 'tháng' : 'năm'}</span>
            </div>
            <span className="plan-price-note">
              {cycle === 'annual' && plan.monthly_price > 0
                ? 'Tương đương ' + currency(Math.round(plan.monthly_price * 0.8)) + '/tháng'
                : 'Giá minh họa · VNĐ'}
            </span>
            <div className="plan-features">
              {[
                plan.portfolios + ' danh mục đầu tư',
                plan.history_years
                  ? plan.history_years + ' năm dữ liệu lịch sử'
                  : 'Toàn bộ lịch sử khả dụng',
                plan.code === 'free'
                  ? 'Tổng quan và rủi ro cơ bản'
                  : 'Tín hiệu, kiểm thử và yếu tố',
                plan.layouts == null
                  ? 'Studio: không giới hạn bố cục'
                  : plan.layouts === 0
                    ? 'Bố cục tiêu chuẩn'
                    : 'Studio: lưu ' + plan.layouts + ' bố cục',
              ].map((text) => (
                <span key={text}>
                  <Check size={15} />
                  {text}
                </span>
              ))}
            </div>
            <button
              className={'button full ' + (plan.code === 'plus' ? 'lime' : 'outline')}
              disabled={!!busy || (data.plan_code === plan.code && data.billing_cycle === cycle)}
              onClick={() => void choose(plan.code)}
            >
              {busy === plan.code ? <LoaderCircle size={15} className="spin" /> : null}
              {data.plan_code === plan.code && data.billing_cycle === cycle
                ? 'Gói hiện tại'
                : 'Chọn ' + plan.name}
              <ArrowRight size={15} />
            </button>
          </section>
        ))}
      </div>
      <div className="subscription-note">
        <Sparkles size={17} />
        <p>{data?.notice || 'Giá và quyền lợi minh họa, không có thanh toán thật.'}</p>
      </div>
      <section className="comparison-section">
        <span className="eyebrow">SO SÁNH QUYỀN LỢI MINH HỌA</span>
        <h2>Chọn mức hỗ trợ phù hợp.</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tính năng</th>
                <th>Free</th>
                <th>Plus</th>
                <th>Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Danh mục đầu tư</td>
                <td>1</td>
                <td>5</td>
                <td>20</td>
              </tr>
              <tr>
                <td>Lịch sử dữ liệu</td>
                <td>1 năm</td>
                <td>5 năm</td>
                <td>Khả dụng</td>
              </tr>
              <tr>
                <td>Tín hiệu và kiểm thử</td>
                <td>—</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Phân tích yếu tố</td>
                <td>—</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Bố cục Studio</td>
                <td>Tiêu chuẩn</td>
                <td>3</td>
                <td>Không giới hạn</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div className="faq-section">
        <h2>Một vài điều bạn muốn biết.</h2>
        <div className="faq-grid">
          <details>
            <summary>
              Có thể đổi gói bất cứ lúc nào?
              <ChevronDown size={15} />
            </summary>
            <p>
              Trong demo, bạn có thể đổi gói để thử giao diện. Không phát sinh thanh toán và chưa áp
              dụng hạn mức theo gói.
            </p>
          </details>
          <details>
            <summary>
              Hủy gói có mất danh mục không?
              <ChevronDown size={15} />
            </summary>
            <p>
              Đổi về Free trong demo vẫn giữ danh mục. Chính sách thương mại chính thức sẽ được nhóm
              thống nhất ở giai đoạn sau.
            </p>
          </details>
        </div>
      </div>
    </>
  );
}
