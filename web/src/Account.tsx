import { useState } from 'react';
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
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
  const [updates, setUpdates] = useState(() => {
    try {
      return localStorage.getItem('dofiin:updates:' + user.id) === 'true';
    } catch {
      return false;
    }
  });
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
                <p>{user.email}</p>
              </div>
              <span className="tag">Active</span>
            </div>
            <div className="account-divider" />
            <h3>Google</h3>
            <p>Google sign-in is not connected.</p>
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
              <label>
                Language
                <select value="en" disabled>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                Analysis currency
                <select value="USD" disabled>
                  <option value="USD">USD · US dollar</option>
                </select>
              </label>
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
