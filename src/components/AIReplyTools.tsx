import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function AIReplyTools({ text, label, disabled = false }: { text: string; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const request = useRef(0);
  const fieldId = useId();

  useEffect(() => {
    setCopied(false); setManual(false);
    return () => { request.current += 1; };
  }, [text]);
  useEffect(() => {
    if (manual) { input.current?.focus(); input.current?.select(); }
  }, [manual]);

  async function copy() {
    if (disabled || !text.trim()) return;
    const current = ++request.current;
    setCopied(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (current !== request.current) return;
      setManual(false); setCopied(true);
    } catch {
      if (current !== request.current) return;
      setManual(true);
      input.current?.focus(); input.current?.select();
    }
  }

  return <div className="ai-reply-tools">
    <button className="ai-reply-copy" type="button" aria-label={`Copy ${label}`} disabled={disabled || !text.trim()} onClick={() => void copy()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy reply'}</button>
    <span className="ai-copy-status" role="status">{copied ? 'Reply copied.' : manual ? 'Select and copy the reply below.' : ''}</span>
    {manual && <label className="ai-copy-fallback" htmlFor={fieldId}>Text of {label}<textarea id={fieldId} ref={input} readOnly value={text} onFocus={event => event.currentTarget.select()} rows={5} /></label>}
  </div>;
}
