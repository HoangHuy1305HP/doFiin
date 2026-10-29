import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import type { User } from './types';

export default function AccountMenu({ user, onAccount, onSignOut }: {
  user: User;
  onAccount: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={root}>
      <button
        className="topbar-avatar"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {user.display_name.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="account-menu-popover" role="menu" aria-label="Account menu">
          <span className="account-menu-email">{user.email}</span>
          <button role="menuitem" onClick={() => { setOpen(false); onAccount(); }}>
            <UserRound size={16} /> Account
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
