import { useState } from 'react';
import { ArrowUpRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react';
import { post, setToken } from './api';

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={'brand ' + (light ? 'brand-light' : '')}>
      <span className="brand-monogram" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" focusable="false" aria-hidden="true">
          <rect x="3" y="3" width="42" height="42" rx="7.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M9 39V33.2C14.2 33.5 18.2 30.7 20.8 26.5C23 22.4 23.7 18.9 26.9 15.5C26.5 14.1 25.7 13 24.2 12C27.2 11.1 29.7 11.9 32 13.7C35.1 12.4 38 13 39.8 15.6C41 16 41.8 16.7 41.6 17.3C41.1 18.1 38.7 18.4 37.4 19C34.5 20.2 33.3 22.1 32.5 24.2C31.4 26.8 29.8 28.1 27.8 28.8L28.3 25.3C25.6 26.5 22.9 28.1 20.8 29.7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>
        doFiin<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export default function Auth({
  onSigned,
  initialMode = 'login',
  onHome,
  onModeChange,
}: {
  onSigned: (demo?: boolean) => Promise<void>;
  initialMode?: 'login' | 'register';
  onHome?: () => void;
  onModeChange?: (mode: 'login' | 'register') => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [remember, setRemember] = useState(true);
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
          display_name: demo ? 'Demo investor' : name,
        });
      const tokens = await post<{ access_token: string }>('/auth/login', {
        ...credentials,
        client_type: 'web',
      });
      try {
        localStorage.setItem('dofiin:remember', String(demo || remember));
        sessionStorage.setItem('dofiin:active-session', 'true');
      } catch {
        /* Authentication still works without browser storage. */
      }
      setToken(tokens.access_token);
      await onSigned(demo);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy('');
    }
  }
  return (
    <div className={'auth-page auth-' + mode}>
      <aside className="auth-story">
        <button className="brand-home" onClick={onHome} aria-label="doFiin home">
          <Brand light />
        </button>
        <div className="auth-story-copy">
          <span className="eyebrow light">KNOW YOUR PORTFOLIO. INVEST WITH INTENT.</span>
          <h1>
            A clearer perspective.
            <br />
            Make informed decisions.
          </h1>
          <p>
            Track performance, understand risk
            <br />
            and explore what drives your portfolio.
          </p>
          <img
            className="auth-product"
            src="/assets/auth-portfolio.svg"
            width="504"
            height="314"
            alt="Performance and risk, in one clear view."
          />
          <p className="auth-caption">Insight for every investment decision.</p>
        </div>
        <div className="auth-story-footer">
          <span>© 2026 doFiin</span>
        </div>
      </aside>
      <div className="auth-form-wrap">
        <div className="auth-mobile-brand">
          <button className="brand-home" onClick={onHome}>
            <Brand />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setError(
                'Sign in with your email and password, or use Explore demo to try a sample portfolio.',
              )
            }
          >
            Help ↗
          </button>
        </div>
        <div className="auth-form">
          <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</span>
          <h2>{mode === 'login' ? 'Sign in to doFiin.' : 'Get started with doFiin.'}</h2>
          <p>
            {mode === 'login'
              ? 'Continue exploring your portfolio.'
              : 'Create an account to track your portfolio.'}
          </p>
          <button
            className="button google-button"
            type="button"
            onClick={() =>
              setError('Google sign-in is not available yet. Please continue with email.')
            }
          >
            <img src="/assets/google.svg" width="22" height="22" alt="" />
            Continue with Google
          </button>
          <div className="separator">
            <span>or</span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {mode === 'register' && (
              <label>
                Full name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="Your name"
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
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  type={visiblePassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'register' ? 10 : 1}
                  maxLength={128}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'register' ? 'Create password' : 'Enter password'}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visiblePassword ? 'Hide password' : 'Show password'}
                  onClick={() => setVisiblePassword(!visiblePassword)}
                >
                  {visiblePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {mode === 'register' ? (
              <>
                <span className="small-note">At least 10 characters.</span>
                <label className="auth-consent">
                  <input type="checkbox" required />
                  <span>I agree to the doFiin Terms of Use and Privacy Policy.</span>
                </label>
              </>
            ) : (
              <div className="auth-options">
                <label>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setError(
                      'Password reset is not available yet. Contact support for account access.',
                    )
                  }
                >
                  Forgot password?
                </button>
              </div>
            )}
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={!!busy} type="submit">
              {busy === 'auth' && <LoaderCircle className="spin" size={17} />}{' '}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="auth-switch">
            {mode === 'login' ? 'New to doFiin?' : 'Already have an account?'}{' '}
            <button
              onClick={() => {
                const nextMode = mode === 'login' ? 'register' : 'login';
                setMode(nextMode);
                onModeChange?.(nextMode);
                setError('');
              }}
            >
              {mode === 'login' ? 'Sign up free →' : 'Sign in →'}
            </button>
          </p>
          <p className="auth-privacy">
            <LockKeyhole size={14} />
            Your data stays private.
          </p>
          <button
            className="text-button auth-demo-link"
            disabled={!!busy}
            onClick={() => void submit(true)}
          >
            {busy === 'demo' ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
            Explore demo
            <ArrowUpRight size={15} />
          </button>
        </div>
        <footer className="auth-bottom">
          <span>© 2026 doFiin</span>
          <span>Privacy · Terms</span>
        </footer>
      </div>
    </div>
  );
}
