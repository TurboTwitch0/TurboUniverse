import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { setOwnerKey } from '../api';

export default function OwnerLogin({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('input')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      previousFocus?.focus();
    };
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy || !key.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin', { headers: { Authorization: `Bearer ${key.trim()}` }, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'That owner key wasn’t recognized. Try again.' : 'Sign-in is unavailable right now. Please try again.');
      setOwnerKey(key.trim()); setKey(''); onSuccess();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="project-dialog owner-login-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="owner-login-title">
      <div className="dialog-head"><div><span className="eyebrow">THE CREATOR’S CONTROL ROOM</span><h2 id="owner-login-title">Welcome back, Turbo.</h2></div><button className="icon-button" onClick={onClose} aria-label="Close owner sign-in"><X size={20} /></button></div>
      <p className="dialog-description muted">Sign in to add projects and manage your universe.</p>
      <form onSubmit={login} className="owner-login-form"><label className="field">Owner key<input type="password" name="owner-key" value={key} onChange={event => setKey(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>
        <p className="field-hint">Your sign-in stays in this browser tab. Close the tab or sign out when you’re done.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-footer"><span className="muted"><LockKeyhole size={12} /> Owner access</span><button type="submit" className="primary-button" disabled={busy || !key.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUpRight size={16} />}{busy ? 'Signing in…' : 'Manage my universe'}</button></div>
      </form>
    </div>
  </div>;
}
