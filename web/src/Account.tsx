import { useEffect, useState } from 'react';
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import StudioSelect from './StudioSelect';
import GoogleSignInButton from './GoogleSignInButton';
import { api, post } from './api';
import { useLanguage } from './i18n';
import type { User } from './types';
export default function Account({
  user,
  portfolioCount,
  onPlans,
  onSignOut,
}: {
  user: User;
  portfolioCount: number;
  onPlans: () => void;
  onSignOut: () => void;
}) {
  const { language, setLanguage } = useLanguage();
  const [updates, setUpdates] = useState(() => {
    try {
      return localStorage.getItem('dofiin:updates:' + user.id) === 'true';
    } catch {
      return false;
    }
  });
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleError, setGoogleError] = useState('');
  useEffect(() => {
    let active = true;
    void api<{ connected: boolean }>('/auth/google/status')
      .then((status) => { if (active) setGoogleConnected(status.connected); })
      .catch(() => { if (active) setGoogleError('Could not check Google connection.'); });
    return () => { active = false; };
  }, [user.id]);
  async function linkGoogle(credential: string) {
    setGoogleError('');
    try {
      await post('/auth/google/link', { credential });
      setGoogleConnected(true);
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Could not connect Google.');
    }
  }
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">ACCOUNT</span>
        <h1>Your own space.</h1>
        <p>Manage your profile, sign-in and data display preferences.</p>
      </div>
      <div className="account-grid">
        <div className="account-sections">
          <section className="account-card">
            <h2>Personal profile</h2>
            <div className="account-profile">
              <span className="avatar">{user.display_name.slice(0, 2).toUpperCase()}</span>
              <div>
                <h3>{user.display_name}</h3>
                <p>{user.email}</p>
              </div>
            </div>
            <div className="account-fields">
              <label>
                Full name
                <input value={user.display_name} readOnly />
              </label>
              <label>
                Email
                <input value={user.email} readOnly type="email" />
              </label>
            </div>
            <p className="small-note">
              Your current account details. Profile editing will be available in a future update.
            </p>
          </section>
          <section className="account-card">
            <h2>Sign-in &amp; security</h2>
            <div className="account-security-row">
              <LockKeyhole size={22} />
              <div>
                <h3>Email &amp; password</h3>
                <p>{user.has_password ? user.email : 'Password not set'}</p>
              </div>
              <span className="tag">{user.has_password ? 'Active' : 'Not set'}</span>
            </div>
            <div className="account-divider" />
            <h3>Google</h3>
            {googleConnected === null ? (
              <p>Checking Google connection…</p>
            ) : googleConnected ? (
              <p>Google sign-in is connected to this account.</p>
            ) : (
              <>
                <p>Connect Google to sign in to this account without your password.</p>
                <GoogleSignInButton onCredential={(credential) => void linkGoogle(credential)} onError={setGoogleError} />
              </>
            )}
            {googleError && <p role="alert" className="form-error">{googleError}</p>}
            <div className="account-divider" />
            <h3>Active session</h3>
            <div className="account-security-row">
              <p>Current browser · This device</p>
              <span className="tag">
                <ShieldCheck size={12} />
                Signed in
              </span>
            </div>
          </section>
          <section className="account-card">
            <h2>Preferences</h2>
            <div className="account-fields">
              <div className="account-readonly-field">
                <span>Language</span>
                <StudioSelect label="Language" value={language} options={[{value: 'vi', label: 'Tiếng Việt'}, {value: 'en', label: 'English'}]} onChange={(value) => setLanguage(value === 'vi' ? 'vi' : 'en')} />
              </div>
              <div className="account-readonly-field">
                <span>Analysis currency</span>
                <StudioSelect label="Analysis currency" value="USD" options={[{ value: 'USD', label: 'USD · US dollar' }]} onChange={() => {}} disabled />
              </div>
            </div>
            <p className="small-note">Time zone: Asia/Ho_Chi_Minh (UTC+7)</p>
            <div className="account-divider" />
            <label className="account-toggle">
              Product update preference on this device
              <input
                type="checkbox"
                checked={updates}
                onChange={(event) => {
                  setUpdates(event.target.checked);
                  try {
                    localStorage.setItem('dofiin:updates:' + user.id, String(event.target.checked));
                  } catch {
                    /* Browser storage may be unavailable. */
                  }
                }}
              />
            </label>
          </section>
          <section className="account-manage">
            <div>
              <h3>Manage account</h3>
              <p>You can sign out of this device.</p>
            </div>
            <button className="button outline" onClick={onSignOut}>
              <LogOut size={16} />
              Sign out
            </button>
          </section>
        </div>
        <aside className="account-aside">
          <section className="account-card account-plan">
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>
              {portfolioCount} {portfolioCount === 1 ? 'portfolio' : 'portfolios'}
            </h2>
            <p>Explore plans for your analysis.</p>
            <button className="text-button" onClick={onPlans}>
              Explore plans →
            </button>
          </section>
          <section className="account-card">
            <h2>Need help?</h2>
            <p>Find answers about portfolio analysis.</p>
            <p className="small-note">
              Use the Help button in the top bar to explore the methodology.
            </p>
          </section>
          <section className="account-card">
            <span className="eyebrow">ACCOUNT DETAILS</span>
            <h3>doFiin member</h3>
            <p>Your data stays private.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
