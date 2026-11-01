import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WINTER, isWinterSeason, parseWinterPreferences } from '../src/winter.ts';

const local = (year, month, day) => new Date(year, month - 1, day, 12);
const north = { season: 'auto', hemisphere: 'north' };

test('winter edition arrives November 1 and ends March 1 using the local calendar', () => {
  assert.equal(isWinterSeason(north, local(2026, 10, 31)), false);
  assert.equal(isWinterSeason(north, local(2026, 11, 1)), true);
  assert.equal(isWinterSeason(north, local(2026, 12, 31)), true);
  assert.equal(isWinterSeason(north, local(2027, 1, 1)), true);
  assert.equal(isWinterSeason(north, local(2027, 2, 28)), true);
  assert.equal(isWinterSeason(north, local(2028, 2, 29)), true);
  assert.equal(isWinterSeason(north, local(2027, 3, 1)), false);
  assert.equal(isWinterSeason(north, new Date('invalid')), false);
});

test('winter edition follows the southern hemisphere from May through August', () => {
  const south = { ...north, hemisphere: 'south' };
  assert.equal(isWinterSeason(south, local(2026, 4, 30)), false);
  assert.equal(isWinterSeason(south, local(2026, 5, 1)), true);
  assert.equal(isWinterSeason(south, local(2026, 8, 31)), true);
  assert.equal(isWinterSeason(south, local(2026, 9, 1)), false);
  assert.equal(isWinterSeason(south, local(2026, 11, 1)), false);
});

test('explicit season previews take priority over the edition calendar', () => {
  assert.equal(isWinterSeason({ ...north, season: 'winter' }, local(2026, 7, 1)), true);
  for (const season of ['spring', 'summer', 'autumn']) {
    assert.equal(isWinterSeason({ ...north, season }, local(2026, 12, 1)), false);
  }
});

test('winter preferences recover safely and preserve hidden decorations or paused snow', () => {
  for (const raw of [null, '{broken', 'null', '42', '[]']) {
    assert.deepEqual(parseWinterPreferences(raw), DEFAULT_WINTER);
  }
  assert.deepEqual(parseWinterPreferences('{"display":"off","snow":false}'), { display: 'off', snow: false });
  assert.deepEqual(parseWinterPreferences('{"display":"on","snow":true}'), { display: 'on', snow: true });
  assert.deepEqual(parseWinterPreferences('{"display":"invalid","snow":"yes"}'), DEFAULT_WINTER);
});
