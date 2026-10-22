import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANNOUNCEMENT_DURATION_MS,
  announcementExpiresAt,
  dismissAnnouncement,
  isAnnouncementVisible,
  parseAnnouncement,
  parseDismissedAnnouncements,
} from '../src/lib/announcements.ts';

const published = Date.parse('2026-10-21T18:00:00.000Z');
const release = { id: 'release-one', publishedAt: new Date(published).toISOString(), title: 'Fresh in the universe', description: 'A new update has landed.' };

test('announcements last exactly 48 hours from publication, including timezone transitions', () => {
  assert.equal(ANNOUNCEMENT_DURATION_MS, 172_800_000);
  assert.equal(announcementExpiresAt(release), Date.parse('2026-10-23T18:00:00.000Z'));
  assert.equal(isAnnouncementVisible(release, published - 1), false);
  assert.equal(isAnnouncementVisible(release, published), true);
  assert.equal(isAnnouncementVisible(release, published + ANNOUNCEMENT_DURATION_MS - 1), true);
  assert.equal(isAnnouncementVisible(release, published + ANNOUNCEMENT_DURATION_MS), false);
  const daylightSavingRelease = { ...release, publishedAt: '2026-10-31T18:00:00.000Z' };
  assert.equal(announcementExpiresAt(daylightSavingRelease), Date.parse('2026-11-02T18:00:00.000Z'));
});

test('late visits and reloads do not restart the announcement window', () => {
  const lateVisit = published + 47 * 60 * 60 * 1000;
  assert.equal(isAnnouncementVisible(release, lateVisit), true);
  assert.equal(isAnnouncementVisible({ ...release }, published + 49 * 60 * 60 * 1000), false);
});

test('invalid or incomplete release metadata cannot produce a banner', () => {
  assert.deepEqual(parseAnnouncement(release), release);
  for (const value of [null, [], {}, { ...release, id: '' }, { ...release, title: ' ' }, { ...release, description: 5 }, { ...release, publishedAt: 'not a date' }, { ...release, publishedAt: '2026-02-30T18:00:00.000Z' }]) {
    assert.equal(parseAnnouncement(value), null);
  }
  assert.equal(isAnnouncementVisible(null, published), false);
  assert.equal(isAnnouncementVisible(release, Number.NaN), false);
});

test('dismissal is isolated to a release and does not hide future updates', () => {
  const dismissed = dismissAnnouncement([], release.id);
  assert.equal(isAnnouncementVisible(release, published + 1, dismissed), false);
  assert.equal(isAnnouncementVisible({ ...release, id: 'release-two' }, published + 1, dismissed), true);
  assert.deepEqual(dismissAnnouncement(['older', release.id], release.id), [release.id, 'older']);
});

test('stored dismissal IDs recover safely and remain bounded', () => {
  assert.deepEqual(parseDismissedAnnouncements('{broken'), []);
  assert.deepEqual(parseDismissedAnnouncements('{"not":"an array"}'), []);
  assert.deepEqual(parseDismissedAnnouncements(JSON.stringify(['a', '', 12, 'a', 'b'])), ['a', 'b']);
  const many = Array.from({ length: 30 }, (_, index) => `release-${index}`);
  assert.equal(parseDismissedAnnouncements(JSON.stringify(many)).length, 24);
  const next = dismissAnnouncement(many, 'latest');
  assert.equal(next.length, 24);
  assert.equal(next[0], 'latest');
});
