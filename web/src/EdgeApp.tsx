import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Archive, ArrowRight, ChartNoAxesCombined, LoaderCircle, Pencil, Plus, Settings2 } from 'lucide-react';
import Auth, { BrandHome } from './Auth';
import AccountMenu from './AccountMenu';
import { api, restoreSession, setToken } from './api';
import { HistoryDialog, Modal, PortfolioDialog, RenameDialog } from './PortfolioDialog';
import type { Instrument, Portfolio, User, Version } from './types';

export default function EdgeApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [viewVersion, setViewVersion] = useState<Version | null>(null);
  const [dialog, setDialog] = useState<'create' | 'edit' | 'rename' | 'history' | 'archive' | null>(null);
  const [message, setMessage] = useState('');
  const selected = portfolios.find((p) => p.id === selectedId) || portfolios.find((p) => p.profile_role === 'default') || portfolios[0] || null;
  const displayed = viewVersion || selected?.latest_version;

  async function load() {
    const [me, assets, list] = await Promise.all([
      api<User>('/users/me'), api<Instrument[]>('/instruments'), api<Portfolio[]>('/portfolios'),
    ]);
    setUser(me);
    setInstruments(assets);
    setPortfolios(list);
    setSelectedId((current) => list.some((p) => p.id === current) ? current : (list.find((p) => p.profile_role === 'default') || list[0])?.id || '');
  }
  useEffect(() => {
    void (async () => {
      try { if (await restoreSession()) await load(); }
      catch { setUser(null); }
      finally { setBooting(false); }
    })();
  }, []);
  async function saved(portfolio: Portfolio) {
    const list = await api<Portfolio[]>('/portfolios');
    setPortfolios(list);
    setSelectedId(portfolio.id);
    setViewVersion(null);
    setMessage('Portfolio saved.');
  }
  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }); }
    finally {
      setToken(''); setUser(null); setPortfolios([]); setSelectedId('');
      navigate('/');
    }
  }
  async function archive() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      await api('/portfolios/' + selected.id + '/archive', { method: 'POST' });
      const list = await api<Portfolio[]>('/portfolios');
      setPortfolios(list); setSelectedId((list.find((p) => p.profile_role === 'default') || list[0])?.id || ''); setViewVersion(null); setDialog(null);
      setMessage('Portfolio archived.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to archive.'); }
    finally { setBusy(false); }
  }
  if (booting) return <div className="boot-screen"><BrandHome /><LoaderCircle className="spin" /><p>Opening your workspace…</p></div>;
  if (location.pathname === '/') return (
    <div className="edge-landing">
      <header><BrandHome /><div>{user && <AccountMenu user={user} onAccount={() => navigate('/account')} onSignOut={() => void signOut()} />}<button className="button primary" onClick={() => navigate(user ? '/portfolio' : '/sign-in')}>{user ? 'Open workspace' : 'Sign in with Google'} <ArrowRight size={17} /></button></div></header>
      <main><span className="eyebrow">DOFIIN FREE DEMO</span><h1>Your portfolios,<br />in one clear place.</h1><p>Build a portfolio, set its purchase date and starting capital, and keep every version. Sign in with Google to save it to your account.</p><button className="button primary" onClick={() => navigate(user ? '/portfolio' : '/sign-in')}>Get started <ArrowRight size={17} /></button><div className="edge-limits">Google sign-in and portfolio management are available. Live charts, backtests and Studio analysis require the full backend.</div></main>
    </div>
  );
  if (location.pathname === '/sign-in' || location.pathname === '/sign-up') {
    if (user) return <Navigate to="/portfolio" replace />;
    return <Auth initialMode="login" onSigned={async () => { await load(); navigate('/portfolio'); }} />;
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  if (location.pathname !== '/portfolio' && location.pathname !== '/account') return <Navigate to="/portfolio" replace />;
  return (
    <div className="edge-app">
      <aside className="edge-sidebar"><BrandHome light /><span className="sidebar-eyebrow">WORKSPACE</span><nav><Link className={location.pathname === '/portfolio' ? 'nav-item active' : 'nav-item'} to="/portfolio"><ChartNoAxesCombined size={19} /> Portfolio</Link></nav><div className="edge-sidebar-foot"><span>Free demo · Google + D1</span></div></aside>
      <div className="edge-main"><header className="edge-topbar"><span>doFiin / {location.pathname === '/account' ? 'Account' : 'Portfolio'}</span><AccountMenu user={user} onAccount={() => navigate('/account')} onSignOut={() => void signOut()} /></header>
        {location.pathname === '/account' ? <main className="edge-content"><span className="eyebrow">ACCOUNT</span><h1>Your account</h1><div className="edge-panel"><strong>{user.display_name}</strong><p>{user.email}</p><p>Google sign-in · Free demo</p><button className="button outline" onClick={() => void signOut()}>Sign out</button></div></main> :
        <main className="edge-content"><div className="edge-heading"><div><span className="eyebrow">PORTFOLIO</span><h1>Your portfolios</h1><p>Choose a profile, manage assets and preserve changes as versions.</p></div><button className="button primary" onClick={() => setDialog('create')}><Plus size={17} /> Add portfolio</button></div>
          <div className="edge-workspace"><section className="edge-list" aria-label="Portfolios">{portfolios.map((p) => <button key={p.id} className={p.id === selected?.id ? 'edge-profile selected' : 'edge-profile'} onClick={() => { setSelectedId(p.id); setViewVersion(null); }}><span><strong>{p.name}</strong><small>{p.profile_role ? p.profile_role === 'benchmark' ? 'Benchmark profile' : 'Default profile' : 'Custom portfolio'}</small></span><span>v{p.current_version}</span></button>)}</section>
            {selected && displayed && <section className="edge-detail"><div className="edge-detail-head"><div><span className="eyebrow">{viewVersion ? 'SAVED VERSION' : 'ACTIVE PROFILE'}</span><h2>{selected.name}</h2><p>Version {displayed.version_number} · Purchase date {displayed.purchase_date || '—'}</p></div><div className="edge-actions">{viewVersion ? <button className="button outline" onClick={() => setViewVersion(null)}>Back to current</button> : <><button className="button outline" onClick={() => setDialog('rename')}><Pencil size={15} /> Rename</button><button className="button outline" onClick={() => setDialog('edit')}><Settings2 size={15} /> Edit holdings</button></>}</div></div>
              <div className="edge-stats"><div><span>Starting capital</span><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(displayed.initial_capital))}</strong></div><div><span>Allocated</span><strong>{(displayed.allocations.reduce((sum, a) => sum + Number(a.weight), 0) * 100).toFixed(2)}%</strong></div><div><span>USD cash</span><strong>{(Math.max(0, 1 - displayed.allocations.reduce((sum, a) => sum + Number(a.weight), 0)) * Number(displayed.initial_capital)).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</strong></div></div>
              <h3>Holdings and weights</h3><div className="edge-allocations">{displayed.allocations.map((a) => <div key={a.instrument_id}><strong>{a.symbol}</strong><span>{(Number(a.weight) * 100).toFixed(2)}%</span></div>)}</div><div className="edge-detail-bottom"><button className="text-button" onClick={() => setDialog('history')}>View version history →</button>{!selected.profile_role && !viewVersion && <button className="text-button" onClick={() => setDialog('archive')}><Archive size={15} /> Archive</button>}</div>
            </section>}</div><div className="edge-notice">Live performance charts, Alpaca data, risk analysis, backtests and Studio are unavailable in this Free deployment. Portfolio configuration remains saved in Cloudflare D1.</div>{message && <div role="status" className="edge-message">{message}</div>}</main>}
      </div>
      {(dialog === 'create' || dialog === 'edit') && <PortfolioDialog portfolio={dialog === 'edit' ? selected : null} instruments={instruments} onSaved={saved} onClose={() => setDialog(null)} />}
      {dialog === 'rename' && selected && <RenameDialog portfolio={selected} onSaved={saved} onClose={() => setDialog(null)} />}
      {dialog === 'history' && selected && <HistoryDialog portfolio={selected} actionLabel="View version →" onView={(version) => setViewVersion(version)} onClose={() => setDialog(null)} />}
      {dialog === 'archive' && selected && <Modal title="Archive portfolio?" subtitle={selected.name} onClose={() => setDialog(null)}><p>The portfolio will be removed from the active list, while its saved versions remain in D1.</p><div className="modal-actions"><button className="button outline" onClick={() => setDialog(null)}>Cancel</button><button className="button danger" disabled={busy} onClick={() => void archive()}>Archive</button></div></Modal>}
    </div>
  );
}
