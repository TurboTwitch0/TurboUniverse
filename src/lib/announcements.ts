export const ANNOUNCEMENT_DURATION_MS = 48 * 60 * 60 * 1000;
export const DISMISSED_ANNOUNCEMENTS_KEY = 'turbo-universe-dismissed-updates';

export type ReleaseAnnouncement = {
  id: string;
  publishedAt: string;
  title: string;
  description: string;
};

/** Only build-produced, complete release metadata can create an announcement. */
export function parseAnnouncement(value: unknown): ReleaseAnnouncement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const release = value as Record<string, unknown>;
  for (const [field, maximum] of [['id', 180], ['title', 140], ['description', 400]] as const) {
    const entry = release[field];
    if (typeof entry !== 'string' || !entry.trim() || entry.length > maximum) return null;
  }
  if (typeof release.publishedAt !== 'string') return null;
  const timestamp = Date.parse(release.publishedAt);
  if (!Number.isFinite(timestamp)) return null;
  // Require a canonical timestamp; Date.parse alone normalizes impossible days.
  if (new Date(timestamp).toISOString() !== release.publishedAt) return null;
  return {
    id: (release.id as string).trim(),
    publishedAt: release.publishedAt,
    title: (release.title as string).trim(),
    description: (release.description as string).trim(),
  };
}

export function announcementExpiresAt(release: ReleaseAnnouncement): number {
  return Date.parse(release.publishedAt) + ANNOUNCEMENT_DURATION_MS;
}

export function isAnnouncementVisible(
  release: ReleaseAnnouncement | null,
  now: number,
  dismissed: readonly string[] = [],
): boolean {
  if (!release || !Number.isFinite(now) || dismissed.includes(release.id)) return false;
  const published = Date.parse(release.publishedAt);
  return Number.isFinite(published) && now >= published && now < published + ANNOUNCEMENT_DURATION_MS;
}

export function parseDismissedAnnouncements(value: string | null): string[] {
  if (!value) return [];
  try {
    const ids: unknown = JSON.parse(value);
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 180))].slice(0, 24);
  } catch { return []; }
}

export function dismissAnnouncement(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter(entry => entry !== id)].slice(0, 24);
}
