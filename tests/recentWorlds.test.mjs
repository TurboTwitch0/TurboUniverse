import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecentWorldStore, parseRecentWorlds, RECENT_WORLDS_KEY, rememberWorld } from '../src/recentWorlds.ts';
import { canonicalWorldId } from '../src/catalogAliases.ts';
import { withWorldStorageLock } from '../src/worldStorageLock.ts';

test('recent worlds recover from malformed storage and retain only bounded unique identifiers', () => {
  for (const value of [null, '', '{oops', '{}', '42']) assert.deepEqual(parseRecentWorlds(value), []);
  assert.deepEqual(parseRecentWorlds(JSON.stringify(['one', null, '', 'one', 'x'.repeat(129), 'two'])), ['one', 'two']);
  assert.equal(parseRecentWorlds(JSON.stringify(Array.from({ length: 15 }, (_, index) => String(index)))).length, 6);
});

test('revisits move to the front without duplicates, and history remains limited to six worlds', () => {
  const ids = ['one', 'two', 'three', 'four', 'five', 'six'];
  assert.deepEqual(rememberWorld(ids, 'three'), ['three', 'one', 'two', 'four', 'five', 'six']);
  assert.deepEqual(rememberWorld(ids, 'seven'), ['seven', 'one', 'two', 'three', 'four', 'five']);
  assert.strictEqual(rememberWorld(ids, 'one'), ids);
  assert.strictEqual(rememberWorld(ids, ''), ids);
  assert.deepEqual(ids, ['one', 'two', 'three', 'four', 'five', 'six']);
});

test('the removed duplicate keeps old world links and recent history mapped to StudyOrbit', () => {
  const legacy = '4d14f53c-7186-518f-85c6-63f0752a1614';
  const current = '082fc48b-9cd7-4ae9-ba7a-18bf1ec83dd7';
  assert.equal(canonicalWorldId(legacy), current);
  assert.deepEqual(parseRecentWorlds(JSON.stringify([legacy, current, 'another-world'])), [current, 'another-world']);
  assert.deepEqual(rememberWorld(['another-world', current], legacy), [current, 'another-world']);
  const latest = [current, 'another-world'];
  assert.strictEqual(rememberWorld(latest, legacy), latest);
  for (const id of ['another-world', '__proto__', 'constructor']) assert.equal(canonicalWorldId(id), id);
});

function fixture() {
  let raw = null;
  let readBlocked = false;
  let writeBlocked = false;
  const storage = {
    getItem: () => { if (readBlocked) throw new Error('Read blocked'); return raw; },
    setItem: (_key, value) => { if (writeBlocked) throw new Error('Write blocked'); raw = value; },
    removeItem: () => { if (writeBlocked) throw new Error('Write blocked'); raw = null; },
  };
  return { storage, replace: ids => { raw = JSON.stringify(ids); }, raw: () => raw,
    blockRead: value => { readBlocked = value; }, blockWrite: value => { writeBlocked = value; } };
}

test('stale recent stores preserve newer visits and serialize record, revisit and clear intent', async () => {
  const data = fixture();
  const first = createRecentWorldStore(() => data.storage);
  const second = createRecentWorldStore(() => data.storage);
  await first.record('remote');
  await second.record('local');
  assert.deepEqual(first.sync(), ['local', 'remote']);
  await Promise.all([second.record('remote'), second.record('third'), second.clear(), second.record('last')]);
  assert.deepEqual(JSON.parse(data.raw()), ['last']);
  await second.clear();
  assert.equal(data.raw(), null);
});

test('a queued recent visit reads history when its native lock is acquired', async () => {
  const data = fixture();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const locks = { request: async (_key, action) => { await held; return action(); } };
  const store = createRecentWorldStore(() => data.storage, action => withWorldStorageLock(RECENT_WORLDS_KEY, action, locks));
  const pending = store.record('local');
  data.replace(['remote']);
  release();
  assert.deepEqual(await pending, ['local', 'remote']);
  assert.deepEqual(JSON.parse(data.raw()), ['local', 'remote']);
});

test('blocked recent reads and writes preserve visit history through sync and storage recovery', async () => {
  for (const failure of ['read', 'write']) {
    const data = fixture();
    data.replace(['device']);
    data.blockRead(failure === 'read');
    const store = createRecentWorldStore(() => data.storage);
    data.blockWrite(failure === 'write');
    await store.record('visit');
    const expected = failure === 'read' ? ['visit'] : ['visit', 'device'];
    data.replace(['remote']);
    assert.deepEqual(store.sync(), expected);
    data.blockRead(false); data.blockWrite(false);
    assert.deepEqual(await store.record('next'), ['next', ...expected]);
    assert.deepEqual(JSON.parse(data.raw()), ['remote']);
    assert.deepEqual(createRecentWorldStore(() => data.storage).snapshot(), ['remote']);
  }
});

test('unavailable or denied locks run the operation once, and started callbacks are never replayed', async () => {
  const denied = { request: async () => { throw new Error('Locks denied'); } };
  let calls = 0;
  assert.equal(await withWorldStorageLock('key', () => ++calls), 1);
  assert.equal(await withWorldStorageLock('key', () => ++calls, denied), 2);
  const failure = new Error('Operation failed');
  const active = { request: async (_key, action) => action() };
  await assert.rejects(withWorldStorageLock('key', () => { calls++; throw failure; }, active), error => error === failure);
  assert.equal(calls, 3);
  const data = fixture();
  const store = createRecentWorldStore(() => data.storage, action => withWorldStorageLock(RECENT_WORLDS_KEY, action, denied));
  await Promise.all([store.record('one'), store.record('two')]);
  assert.deepEqual(JSON.parse(data.raw()), ['two', 'one']);
});
