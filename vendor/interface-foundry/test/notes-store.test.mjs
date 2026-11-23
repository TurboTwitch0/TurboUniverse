import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotesStore, DEFAULT_NOTES, MAX_NOTES, STORAGE_KEY } from '../assets/notes-store.js';

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
}
const valid = overrides => ({ kind: 'note', title: 'A useful observation', body: 'Specific evidence matters.', ...overrides });

test('CRUD persists to a supplied adapter and reloads the complete collection', () => {
  const storage = memoryStorage();
  const store = createNotesStore(storage);
  assert.equal(store.persistent, true);
  assert.equal(store.lastSaveSucceeded, true);
  assert.deepEqual(store.list(), DEFAULT_NOTES);
  const created = store.create(valid({ title: '  Research finding  ' }));
  assert.equal(created.title, 'Research finding');
  assert.equal(store.list()[0].id, created.id);
  const updated = store.update(created.id, { kind: 'decision', body: 'Choose the smaller experiment.' });
  assert.equal(updated.title, 'Research finding');
  assert.equal(updated.kind, 'decision');
  const reloaded = createNotesStore(storage);
  assert.deepEqual(reloaded.list(), store.list());
  assert.deepEqual(reloaded.remove(created.id), updated);
  assert.deepEqual(createNotesStore(storage).list(), DEFAULT_NOTES);
  assert.throws(() => reloaded.update(created.id, { title: 'Gone' }), /no longer exists/);
  assert.throws(() => reloaded.remove(created.id), /no longer exists/);
});

test('search matches title or body without case sensitivity and respects kind filters', () => {
  const store = createNotesStore();
  assert.equal(store.search('USEFUL').length, 2);
  assert.equal(store.search('useful', 'decision').length, 1);
  assert.equal(store.search('  QUIETER  ', 'note')[0].id, 'note-room');
  assert.equal(store.search('not present').length, 0);
  assert.equal(store.search('', 'all').length, 3);
  assert.throws(() => store.search(null), /must be a string/);
  assert.throws(() => store.search('', 'other'), /Filter/);
});

test('delete and restore preserve IDs and the requested position; reset restores defaults', () => {
  const storage = memoryStorage();
  const store = createNotesStore(storage);
  const before = store.list();
  const removed = store.remove(before[1].id);
  assert.deepEqual(store.restore(removed, 1), removed);
  assert.deepEqual(store.list(), before);
  assert.throws(() => store.restore(removed), /already exists/);
  store.create(valid());
  assert.deepEqual(store.reset(), DEFAULT_NOTES);
  assert.deepEqual(createNotesStore(storage).list(), DEFAULT_NOTES);
});

test('invalid creates and updates leave both memory and saved data unchanged', () => {
  const storage = memoryStorage();
  const store = createNotesStore(storage);
  const before = store.list();
  const saved = storage.getItem(STORAGE_KEY);
  const invalid = [
    null, [], valid({ title: '' }), valid({ title: '   ' }), valid({ title: 'x'.repeat(101) }),
    valid({ title: 12 }), valid({ title: new String('Object string') }), valid({ body: 12 }), valid({ body: undefined }),
    valid({ body: 'x'.repeat(2001) }), valid({ kind: 'other' })
  ];
  for (const value of invalid) {
    assert.throws(() => store.create(value));
    assert.deepEqual(store.list(), before);
    assert.equal(storage.getItem(STORAGE_KEY), saved);
  }
  for (const changes of [{ title: '' }, { body: 12 }, { body: undefined }, { kind: 'other' }, { id: 'replacement' }, null, []]) {
    assert.throws(() => store.update(before[0].id, changes));
    assert.deepEqual(store.list(), before);
    assert.equal(storage.getItem(STORAGE_KEY), saved);
  }
  assert.equal(store.create(valid({ title: ` ${'x'.repeat(100)} `, body: 'x'.repeat(2000) })).title.length, 100);
});

test('corrupt or incompatible collections fall back to defaults without partial loading', () => {
  const cases = [
    'not json', 'null', '[]', '{}', JSON.stringify({ version: 2, notes: [] }),
    JSON.stringify({ version: 1, notes: [{ id: 'x', ...valid({ kind: 'invalid' }) }] }),
    JSON.stringify({ version: 1, notes: [{ id: 'x', ...valid() }, { id: 'x', ...valid() }] }),
    JSON.stringify({ version: 1, notes: Array.from({ length: MAX_NOTES + 1 }, (_, i) => ({ id: `n${i}`, ...valid() })) })
  ];
  for (const initial of cases) assert.deepEqual(createNotesStore(memoryStorage(initial)).list(), DEFAULT_NOTES);
  assert.deepEqual(createNotesStore(memoryStorage(JSON.stringify({ version: 1, notes: [] }))).list(), []);
});

test('denied reads and writes remain usable in memory and never claim persistence', () => {
  let writes = 0;
  const deniedRead = createNotesStore({ getItem() { throw new Error('Denied'); }, setItem() { writes++; } });
  deniedRead.create(valid());
  assert.equal(deniedRead.list().length, 4);
  assert.equal(deniedRead.persistent, false);
  assert.equal(deniedRead.lastSaveSucceeded, false);
  assert.equal(writes, 0, 'an unreadable collection must not be overwritten');
  const storage = memoryStorage(JSON.stringify({ version: 1, notes: [{ id: 'loaded', ...valid() }] }));
  let fail = true;
  const originalSet = storage.setItem;
  storage.setItem = function (key, value) { if (fail) throw new Error('Quota'); originalSet.call(this, key, value); };
  const deniedWrite = createNotesStore(storage);
  assert.equal(deniedWrite.list()[0].id, 'loaded');
  deniedWrite.create(valid({ title: 'Still available' }));
  assert.equal(deniedWrite.list().length, 2);
  assert.equal(deniedWrite.persistent, false);
  fail = false;
  deniedWrite.update('loaded', { title: 'Recovered storage' });
  assert.equal(deniedWrite.persistent, true);
  assert.equal(deniedWrite.lastSaveSucceeded, true);
  assert.deepEqual(createNotesStore(storage).list(), deniedWrite.list());
  const memory = createNotesStore();
  assert.equal(memory.persistent, false);
  assert.equal(memory.lastSaveSucceeded, false);
  assert.equal(createNotesStore({}).persistent, false);
});

test('damaged collections are preserved across startup and edits until an explicit reset', () => {
  for (const original of ['{broken', JSON.stringify({ version: 2, notes: [{ title: 'Recover me' }] })]) {
    const storage = memoryStorage(original);
    const store = createNotesStore(storage);
    assert.equal(store.damagedCollection, true);
    assert.equal(store.persistent, false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
    const note = store.create(valid({ title: 'Session-only idea' }));
    store.update(note.id, { body: 'Still exportable' });
    store.remove(DEFAULT_NOTES[0].id);
    assert.equal(storage.getItem(STORAGE_KEY), original);
    assert.equal(store.list()[0].body, 'Still exportable');
    assert.equal(store.lastSaveSucceeded, false);
    store.reset();
    assert.equal(store.damagedCollection, false);
    assert.equal(store.persistent, true);
    assert.deepEqual(createNotesStore(storage).list(), DEFAULT_NOTES);
  }
});

test('returned objects, input objects and defaults cannot mutate internal state', () => {
  const store = createNotesStore();
  const input = valid();
  const created = store.create(input);
  input.title = 'Changed input';
  created.title = 'Changed return';
  const listed = store.list();
  listed[0].body = 'Changed list';
  listed.pop();
  const searched = store.search('evidence');
  searched[0].title = 'Changed search';
  assert.equal(store.list()[0].title, 'A useful observation');
  assert.equal(store.list()[0].body, 'Specific evidence matters.');
  assert.equal(store.list().length, 4);
  const updated = store.update(created.id, { title: 'New title' });
  updated.title = 'Changed update';
  assert.equal(store.list()[0].title, 'New title');
  const removed = store.remove(created.id);
  const restored = store.restore(removed);
  removed.title = 'Changed restore input';
  restored.title = 'Changed restore output';
  assert.equal(store.list().at(-1).title, 'New title');
  const reset = store.reset();
  reset[0].title = 'Changed reset';
  assert.equal(store.list()[0].title, DEFAULT_NOTES[0].title);
  assert.ok(Object.isFrozen(DEFAULT_NOTES));
  assert.ok(DEFAULT_NOTES.every(Object.isFrozen));
});

test('IDs stay unique and capacity or invalid restores never change the collection', () => {
  const store = createNotesStore();
  while (store.list().length < MAX_NOTES) store.create(valid());
  const full = store.list();
  assert.equal(new Set(full.map(note => note.id)).size, MAX_NOTES);
  assert.throws(() => store.create(valid()), /up to 100/);
  assert.throws(() => store.restore({ id: 'new', ...valid() }), /up to 100/);
  assert.deepEqual(store.list(), full);
  const removed = store.remove(full[0].id);
  for (const [note, index] of [[{ ...removed, id: '' }, 0], [removed, -1], [removed, 100], [removed, 1.5]]) {
    assert.throws(() => store.restore(note, index));
    assert.equal(store.list().length, MAX_NOTES - 1);
  }
  store.restore(removed, 0);
  assert.deepEqual(store.list(), full);
});


test('ID fallback works without browser crypto and uses distinct timestamp/counter IDs', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  if (descriptor && !descriptor.configurable) { t.skip('Runtime crypto property cannot be replaced'); return; }
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const store = createNotesStore();
    const first = store.create(valid());
    const second = store.create(valid());
    assert.notEqual(first.id, second.id);
    assert.match(first.id, /^entry-[a-z0-9]+-[a-z0-9]+$/);
    assert.equal(store.list().length, 5);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
});


test('a stale store preserves newer saved bytes and retains its own edits for export', () => {
  const storage = memoryStorage();
  const first = createNotesStore(storage);
  const stale = createNotesStore(storage);
  first.create(valid({ title: 'Saved in the first tab' }));
  const newer = storage.getItem(STORAGE_KEY);
  const temporary = stale.create(valid({ title: 'Temporary second-tab idea' }));
  assert.equal(storage.getItem(STORAGE_KEY), newer);
  assert.equal(stale.storageConflict, true);
  assert.equal(stale.persistent, false);
  assert.equal(stale.lastSaveSucceeded, false);
  assert.ok(stale.list().some(note => note.id === temporary.id));
  stale.update(temporary.id, { body: 'Still editable without overwriting the first tab.' });
  const removed = stale.remove(DEFAULT_NOTES[0].id);
  stale.restore(removed, 1);
  assert.equal(storage.getItem(STORAGE_KEY), newer, 'all later saves remain blocked for this instance');
  stale.reset();
  assert.equal(stale.storageConflict, true, 'reset must not unlock a stale instance');
  assert.equal(storage.getItem(STORAGE_KEY), newer);
  const reloaded = createNotesStore(storage);
  assert.equal(reloaded.storageConflict, false);
  assert.equal(reloaded.persistent, true);
  assert.ok(reloaded.list().some(note => note.title === 'Saved in the first tab'));
});

test('a collection arriving between the startup read and initial save is not overwritten', () => {
  const newer = JSON.stringify({ version: 1, notes: [{ id: 'peer', ...valid({ title: 'Arrived during startup' }) }] });
  let reads = 0, writes = 0;
  const store = createNotesStore({ getItem() { return ++reads === 1 ? null : newer; }, setItem() { writes++; } });
  assert.equal(store.storageConflict, true);
  assert.equal(store.persistent, false);
  assert.equal(writes, 0, 'the exact initial null snapshot is compared before writing defaults');
});

test('external removal is a conflict rather than permission to resurrect an older collection', () => {
  const storage = memoryStorage();
  const store = createNotesStore(storage);
  storage.removeItem(STORAGE_KEY);
  store.create(valid());
  assert.equal(store.storageConflict, true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(store.persistent, false);
});

test('failed read-before-write keeps stored data and permits recovery only after a successful read', () => {
  const saved = memoryStorage();
  let denyRead = false, writes = 0;
  const storage = { getItem(key) { if (denyRead) throw new Error('Read denied'); return saved.getItem(key); }, setItem(key, value) { writes++; saved.setItem(key, value); } };
  const store = createNotesStore(storage);
  const original = saved.getItem(STORAGE_KEY), originalWrites = writes;
  denyRead = true;
  const note = store.create(valid());
  assert.equal(writes, originalWrites);
  assert.equal(saved.getItem(STORAGE_KEY), original);
  assert.equal(store.persistent, false);
  denyRead = false;
  store.update(note.id, { title: 'Read access recovered' });
  assert.equal(store.persistent, true);
  assert.equal(store.storageConflict, false);
  assert.ok(createNotesStore(saved).list().some(note => note.title === 'Read access recovered'));
});

test('damaged-data reset preserves a collection repaired by another tab in the meantime', () => {
  const storage = memoryStorage('{damaged');
  const store = createNotesStore(storage);
  const repaired = JSON.stringify({ version: 1, notes: [{ id: 'peer', ...valid({ title: 'Recovered elsewhere' }) }] });
  storage.setItem(STORAGE_KEY, repaired);
  store.reset();
  assert.equal(store.storageConflict, true);
  assert.equal(store.persistent, false);
  assert.equal(storage.getItem(STORAGE_KEY), repaired);
});
