import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecentWorlds, rememberWorld } from '../src/recentWorlds.ts';

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
