import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecentWorlds, rememberWorld } from '../src/recentWorlds.ts';
import { canonicalWorldId } from '../src/catalogAliases.ts';

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
