import { useEffect, useRef, useState } from 'react';

type GoogleAccounts = {
  initialize: (options: { client_id: string; callback: (result: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccounts } };
  }
}

let scriptReady: Promise<void> | null = null;
let initialized = false;
let credentialHandler: ((credential: string) => void) | null = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptReady) {
    scriptReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptReady = null;
        reject(new Error('Could not load Google sign-in. Check your connection.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptReady;
}

export default function GoogleSignInButton({ onCredential, onError }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const errorCallback = useRef(onError);
  callback.current = onCredential;
  errorCallback.current = onError;
  const [unavailable, setUnavailable] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    const handleCredential = (credential: string) => callback.current(credential);
    credentialHandler = handleCredential;
    let active = true;
    void loadGoogleScript().then(() => {
      if (!active || !container.current || !window.google) return;
      if (!initialized) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => credentialHandler?.(credential),
        });
        initialized = true;
      }
      container.current.replaceChildren();
      window.google.accounts.id.renderButton(container.current, {
        type: 'standard', theme: 'outline', size: 'large',
        text: 'continue_with', shape: 'rectangular', width: Math.min(container.current.clientWidth, 400),
      });
    }).catch((error) => {
      if (active) {
        setUnavailable(true);
        errorCallback.current(error instanceof Error ? error.message : 'Google sign-in is unavailable.');
      }
    });
    return () => {
      active = false;
      if (credentialHandler === handleCredential) credentialHandler = null;
    };
  }, [clientId]);

  if (!clientId) return <p className="small-note">Google sign-in is not configured yet.</p>;
  if (unavailable) return <p className="small-note">Google sign-in is unavailable right now.</p>;
  return <div ref={container} className="google-sign-in" />;
}
