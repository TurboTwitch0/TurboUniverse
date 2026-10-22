import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  DISMISSED_ANNOUNCEMENTS_KEY,
  announcementExpiresAt,
  dismissAnnouncement,
  isAnnouncementVisible,
  parseAnnouncement,
  parseDismissedAnnouncements,
  type ReleaseAnnouncement,
} from '../lib/announcements';

function storedDismissals(): string[] {
  try { return parseDismissedAnnouncements(localStorage.getItem(DISMISSED_ANNOUNCEMENTS_KEY)); }
  catch { return []; }
}

export default function UpdateAnnouncement() {
  const [release, setRelease] = useState<ReleaseAnnouncement | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(storedDismissals);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const controller = new AbortController();
    let requestNumber = 0;
    async function refresh() {
      setNow(Date.now());
      const currentRequest = ++requestNumber;
      try {
        const response = await fetch('/release.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const next = parseAnnouncement(await response.json());
        if (!controller.signal.aborted && currentRequest === requestNumber) setRelease(next);
      } catch {
        // A missing release file or connection does not interrupt the collection.
      }
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const storage = (event: StorageEvent) => {
      if (event.key === DISMISSED_ANNOUNCEMENTS_KEY) setDismissed(parseDismissedAnnouncements(event.newValue));
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5 * 60 * 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('storage', storage);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('storage', storage);
    };
  }, []);

  useEffect(() => {
    if (!release) return;
    const published = Date.parse(release.publishedAt);
    const current = Date.now();
    const boundary = current < published ? published : announcementExpiresAt(release);
    if (boundary <= current) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(boundary - current, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [release, now]);

  if (!isAnnouncementVisible(release, now, dismissed) || !release) return null;

  function dismiss() {
    if (!release) return;
    const next = dismissAnnouncement(dismissed, release.id);
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_ANNOUNCEMENTS_KEY, JSON.stringify(next)); }
    catch { /* Dismissal still works for this visit when storage is unavailable. */ }
  }

  return <aside className="update-announcement" role="status" aria-label="Latest update">
    <span className="update-announcement-icon" aria-hidden="true"><Sparkles size={18} /></span>
    <div className="update-announcement-copy"><span className="update-announcement-badge">NEW UPDATE</span><strong>{release.title}</strong><p>{release.description}</p></div>
    <button className="icon-button update-announcement-dismiss" onClick={dismiss} aria-label="Dismiss update announcement"><X size={16} /></button>
  </aside>;
}
