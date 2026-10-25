import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import { post, setToken } from './api';

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={'brand ' + (light ? 'brand-light' : '')}>
      <svg width="30" height="32" viewBox="0 0 30 32" fill="none" aria-hidden="true">
        <path d="M4 27V5h19L4 27Zm7-11h14v11H11V16Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="m11 27 14-11" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span>
        doFiin<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export default function Auth({ onSigned }: { onSigned: (demo?: boolean) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function submit(demo = false) {
    setError('');
    setBusy(demo ? 'demo' : 'auth');
    try {
      let credentials = { email, password };
      if (demo)
        credentials = {
          email: 'demo-' + crypto.randomUUID() + '@example.com',
          password: crypto.randomUUID() + crypto.randomUUID(),
        };
      if (demo || mode === 'register')
        await post('/auth/register', {
          ...credentials,
          display_name: demo ? 'Nhà đầu tư demo' : name,
        });
      const tokens = await post<{ access_token: string }>('/auth/login', {
        ...credentials,
        client_type: 'web',
      });
      setToken(tokens.access_token);
      await onSigned(demo);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể đăng nhập.');
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand light />
        <div className="auth-story-copy">
          <span className="eyebrow light">GÓC NHÌN RÕ RÀNG HƠN</span>
          <h1>
            Mỗi danh mục,
            <br />
            một câu chuyện.
            <br />
            <em>
              {' '}
              Hiểu câu chuyện
              <br />
              của bạn.
            </em>
          </h1>
          <p>
            Từ tổng thể đến từng chuyển động.
            <br />
            Một không gian để hiểu lợi nhuận, rủi ro
            <br />
            và những lựa chọn phía trước.
          </p>
          <div className="auth-mini-chart">
            <div className="auth-chart-label">
              <span>DANH MỤC MÔ PHỎNG</span>
              <ArrowUpRight size={19} />
            </div>
            <svg viewBox="0 0 440 125" aria-hidden="true">
              <defs>
                <linearGradient id="authFill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#cfe89b" stopOpacity=".2" />
                  <stop offset="1" stopColor="#cfe89b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 105 18 97 30 102 45 78 61 88 75 69 90 80 105 59 125 76 140 68 155 80 172 48 185 55 203 35 218 48 236 40 251 61 265 43 278 52 292 20 305 32 320 14 337 24 350 9 367 23 386 16 404 25 420 10 440 1V125H0Z"
                fill="url(#authFill)"
              />
              <path
                d="m0 105 18-8 12 5 15-24 16 10 14-19 15 11 15-21 20 17 15-8 15 12 17-32 13 7 18-20 15 13 18-8 15 21 14-18 13 9 14-32 13 12 15-18 17 10 13-15 17 14 19-7 18 9 16-15 20-9"
                stroke="#cfe89b"
                strokeWidth="2"
                fill="none"
              />
            </svg>
            <span className="auth-chart-foot">Minh họa · Không phải dữ liệu thị trường</span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>Được xây dựng cho góc nhìn dài hạn.</span>
          <span>DEMO 01</span>
        </div>
      </div>
      <div className="auth-form-wrap">
        <span className="auth-topnote">
          <span className="status-dot" /> Không gian phân tích cá nhân
        </span>
        <div className="auth-form">
          <div className="auth-icon">
            <ChartNoAxesCombined size={24} />
          </div>
          <span className="eyebrow">CHÀO MỪNG ĐẾN VỚI DOFIIN</span>
          <h2>{mode === 'login' ? 'Bắt đầu từ một góc nhìn.' : 'Tạo không gian của bạn.'}</h2>
          <p>
            {mode === 'login'
              ? 'Đăng nhập để tiếp tục với danh mục của bạn.'
              : 'Lưu danh mục và khám phá dữ liệu theo cách của bạn.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {mode === 'register' && (
              <label>
                Họ và tên
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="Tên của bạn"
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="ban@example.com"
              />
            </label>
            <label>
              Mật khẩu
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 10 : 1}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'Tối thiểu 10 ký tự' : 'Nhập mật khẩu của bạn'}
              />
            </label>
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={!!busy} type="submit">
              {busy === 'auth' ? <LoaderCircle className="spin" size={17} /> : null}
              {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Đăng ký miễn phí' : 'Đăng nhập'}
            </button>
          </p>
          <div className="separator">
            <span>hoặc khám phá trước</span>
          </div>
          <button
            className="button demo-button full"
            disabled={!!busy}
            onClick={() => void submit(true)}
          >
            {busy === 'demo' ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
            Trải nghiệm bản demo
            <ArrowUpRight size={16} />
          </button>
          <p className="auth-demo-note">
            Tạo không gian riêng với danh mục mẫu.
            <br />
            Dữ liệu mô phỏng, không cần thông tin thanh toán.
          </p>
        </div>
        <div className="auth-bottom">
          <LockKeyhole size={13} />
          Không gian riêng cho từng tài khoản
        </div>
      </div>
    </div>
  );
}
