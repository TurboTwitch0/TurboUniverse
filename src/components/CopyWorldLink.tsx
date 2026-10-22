import { useEffect, useRef, useState } from 'react';
import { Check, Link2 } from 'lucide-react';

export default function CopyWorldLink({ worldId }: { worldId: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const request = useRef(0);
  // Share only the public project address, never unrelated query parameters.
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('world', worldId);
  const link = url.href;

  useEffect(() => {
    setCopied(false);
    setManual(false);
    return () => {
      request.current += 1;
      window.clearTimeout(timer.current);
    };
  }, [worldId]);

  useEffect(() => {
    if (manual) { input.current?.focus(); input.current?.select(); }
  }, [manual, worldId]);

  async function copyLink() {
    const current = ++request.current;
    window.clearTimeout(timer.current);
    setCopied(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      if (current !== request.current) return;
      setManual(false);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 3000);
    } catch {
      if (current !== request.current) return;
      setManual(true);
      // Select again when retrying a failed clipboard request.
      input.current?.focus(); input.current?.select();
    }
  }

  return <div className="world-link-tools">
    <button className="secondary-button" onClick={() => void copyLink()}>{copied ? <Check size={16} /> : <Link2 size={16} />}{copied ? 'Link copied' : 'Copy world link'}</button>
    <span className="world-link-status" role="status">{copied ? 'World link copied.' : manual ? 'Select and copy the link below.' : ''}</span>
    {manual && <label className="world-link-fallback"><span>World link</span><input ref={input} aria-label="World link" readOnly value={link} onFocus={event => event.currentTarget.select()} /></label>}
  </div>;
}
