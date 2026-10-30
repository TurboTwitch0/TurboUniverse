import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedWorldStore, MAX_SAVED_WORLDS, parseSavedWorlds, SAVED_WORLDS_KEY } from '../src/savedWorlds.ts';

function fixture(initial = []) {
  let raw = JSON.stringify(initial);
  let denyRead = false, denyWrite = false;
  const storage = {
    getItem(key) { assert.equal(key, SAVED_WORLDS_KEY); if (denyRead) throw new Error('Denied'); return raw; },
    setItem(key, value) { assert.equal(key, SAVED_WORLDS_KEY); if (denyWrite) throw new Error('Quota'); raw = value; },
  };
  return { storage, saved: () => JSON.parse(raw), replace: ids => { raw = JSON.stringify(ids); },
    denyRead: value => { denyRead = value; }, denyWrite: value => { denyWrite = value; } };
}

test('saved-world parsing migrates legacy aliases, removes empty and invalid IDs, and bounds storage', () => {
  for (const value of [null, '', '{broken', '{}', 'true']) assert.deepEqual(parseSavedWorlds(value), []);
  const legacy = '4d14f53c-7186-518f-85c6-63f0752a1614';
  const current = '082fc48b-9cd7-4ae9-ba7a-18bf1ec83dd7';
  assert.deepEqual(parseSavedWorlds(JSON.stringify([legacy, current, '', false, 'x'.repeat(129), 'stocks'])), [current, 'stocks']);
  assert.equal(parseSavedWorlds(JSON.stringify(Array.from({ length: 1010 }, (_, i) => `world-${i}`))).length, MAX_SAVED_WORLDS);
});

test('a stale tab preserves newly saved worlds and does not resurrect worlds removed by another tab', async () => {
  const fixtureData = fixture(['old']);
  const first = createSavedWorldStore(() => fixtureData.storage);
  const second = createSavedWorldStore(() => fixtureData.storage);
  await first.toggle('new');
  assert.deepEqual((await second.toggle('another')).ids, ['old', 'new', 'another']);
  await first.toggle('old');
  await second.toggle('last');
  assert.deepEqual(fixtureData.saved(), ['new', 'another', 'last']);
});

test('simultaneous operations use the supplied cross-tab lock and rapid toggles stay ordered', async () => {
  const fixtureData = fixture();
  let lock = Promise.resolve();
  const exclusive = action => {
    const result = lock.then(action);
    lock = result.then(() => {}, () => {});
    return result;
  };
  const first = createSavedWorldStore(() => fixtureData.storage, exclusive);
  const second = createSavedWorldStore(() => fixtureData.storage, exclusive);
  await Promise.all([first.toggle('one'), second.toggle('two')]);
  assert.deepEqual(fixtureData.saved(), ['one', 'two']);
  await Promise.all([first.toggle('three'), first.toggle('three')]);
  assert.deepEqual(fixtureData.saved(), ['one', 'two']);
});

test('blocked removals stay visit-only, survive synchronization, and persist with the next successful edit', async () => {
  const fixtureData = fixture(['old']);
  const store = createSavedWorldStore(() => fixtureData.storage);
  fixtureData.denyWrite(true);
  const removal = await store.toggle('old');
  assert.equal(removal.saved, false);
  assert.equal(removal.persisted, false);
  assert.deepEqual(removal.ids, []);
  assert.deepEqual(fixtureData.saved(), ['old']);
  fixtureData.replace(['old', 'other-tab']);
  assert.deepEqual(store.sync(), ['other-tab']);
  const added = await store.toggle('visit-only');
  assert.equal(added.persisted, false);
  assert.deepEqual(store.sync(), ['other-tab', 'visit-only']);
  fixtureData.denyWrite(false);
  assert.equal((await store.toggle('final')).persisted, true);
  assert.deepEqual(fixtureData.saved(), ['other-tab', 'visit-only', 'final']);
});

test('blocked reads keep the current visit usable without replacing unknown device favorites', async () => {
  const fixtureData = fixture(['device']);
  fixtureData.denyRead(true);
  const store = createSavedWorldStore(() => fixtureData.storage);
  assert.equal((await store.toggle('visit')).persisted, false);
  assert.deepEqual(store.snapshot(), ['visit']);
  assert.deepEqual(fixtureData.saved(), ['device']);
  fixtureData.denyRead(false);
  await store.toggle('next');
  assert.deepEqual(fixtureData.saved(), ['device', 'visit', 'next']);
});

test('at capacity, a new favorite cannot silently displace a saved world on reload', async () => {
  const initial = Array.from({ length: MAX_SAVED_WORLDS }, (_, i) => `world-${i}`);
  const fixtureData = fixture(initial);
  const store = createSavedWorldStore(() => fixtureData.storage);
  assert.equal((await store.toggle('extra')).full, true);
  assert.deepEqual(fixtureData.saved(), initial);
  await store.toggle('world-0');
  assert.equal((await store.toggle('extra')).persisted, true);
  assert.ok(fixtureData.saved().includes('extra'));
  const snapshot = store.snapshot();
  snapshot.length = 0;
  assert.equal(store.snapshot().length, MAX_SAVED_WORLDS);
});

test('pending favorites survive another tab filling device capacity and never persist an over-limit set', async () => {
  const initial = Array.from({ length: MAX_SAVED_WORLDS - 2 }, (_, i) => `world-${i}`);
  const fixtureData = fixture(initial);
  const store = createSavedWorldStore(() => fixtureData.storage);
  fixtureData.denyWrite(true);
  await store.toggle('visit-one');
  await store.toggle('visit-two');
  const otherTab = [...initial, 'other-one', 'other-two'];
  fixtureData.replace(otherTab);
  assert.equal(store.sync().length, MAX_SAVED_WORLDS + 2);
  fixtureData.denyWrite(false);
  const firstRemoval = await store.toggle('world-0');
  assert.equal(firstRemoval.persisted, false);
  assert.equal(firstRemoval.ids.length, MAX_SAVED_WORLDS + 1);
  assert.deepEqual(fixtureData.saved(), otherTab, 'No oversized write replaces the device collection');
  assert.ok(store.sync().includes('visit-two'), 'Visit-only edits remain pending');
  assert.ok(!store.snapshot().includes('world-0'), 'The visit-only removal also remains pending');
  const secondRemoval = await store.toggle('world-1');
  assert.equal(secondRemoval.persisted, true);
  assert.equal(fixtureData.saved().length, MAX_SAVED_WORLDS);
  const reopened = createSavedWorldStore(() => fixtureData.storage);
  assert.deepEqual(reopened.snapshot(), store.snapshot());
  for (const id of ['visit-one', 'visit-two', 'other-one', 'other-two']) assert.ok(reopened.snapshot().includes(id));
  for (const id of ['world-0', 'world-1']) assert.ok(!reopened.snapshot().includes(id));
});
