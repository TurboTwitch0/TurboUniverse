import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_APPEARANCE, parseAppearancePreferences, resolveSeason, seasonForDate } from '../src/theme.ts';

const date = (month, day, year = 2026) => new Date(year, month - 1, day, 12);

test('automatic seasons change at local calendar boundaries, including the year rollover', () => {
  const cases = [
    [date(1, 1), 'winter'], [date(2, 28), 'winter'],
    [date(3, 1), 'spring'], [date(5, 31), 'spring'],
    [date(6, 1), 'summer'], [date(8, 31), 'summer'],
    [date(9, 1), 'autumn'], [date(11, 30), 'autumn'],
    [date(12, 1), 'winter'], [date(12, 31), 'winter'],
    [date(1, 1, 2027), 'winter'], [date(2, 29, 2028), 'winter'],
  ];
  for (const [current, expected] of cases) {
    assert.equal(seasonForDate(current, 'north'), expected, current.toDateString());
  }
});

test('southern hemisphere automatic seasons match the opposite season', () => {
  assert.equal(seasonForDate(date(1, 15), 'south'), 'summer');
  assert.equal(seasonForDate(date(4, 15), 'south'), 'autumn');
  assert.equal(seasonForDate(date(7, 15), 'south'), 'winter');
  assert.equal(seasonForDate(date(10, 15), 'south'), 'spring');
});

test('manual seasonal preview remains selected while automatic mode follows the calendar', () => {
  assert.equal(resolveSeason({ ...DEFAULT_APPEARANCE, season: 'winter', hemisphere: 'south' }, date(4, 1)), 'winter');
  assert.equal(resolveSeason({ ...DEFAULT_APPEARANCE, season: 'auto', hemisphere: 'south' }, date(4, 1)), 'autumn');
  assert.equal(resolveSeason({ ...DEFAULT_APPEARANCE, mode: 'space' }, date(9, 1)), 'autumn');
});

test('unavailable or malformed saved preferences recover to usable defaults', () => {
  for (const raw of [null, '', '{bad json', 'null', '42', 'true', '[]']) {
    assert.deepEqual(parseAppearancePreferences(raw), { ...DEFAULT_APPEARANCE });
  }
});

test('stored preferences validate fields independently and discard unknown settings', () => {
  assert.deepEqual(parseAppearancePreferences(JSON.stringify({ ...DEFAULT_APPEARANCE, mode: 'space', season: 'winter', hemisphere: 'south', motion: false, unexpected: 'ignored' })), {
    ...DEFAULT_APPEARANCE, mode: 'space', season: 'winter', hemisphere: 'south', motion: false,
  });
  assert.deepEqual(parseAppearancePreferences(JSON.stringify({ mode: 'ocean', season: 'monsoon', hemisphere: 'east', motion: 'yes' })), {
    ...DEFAULT_APPEARANCE,
  });
  assert.deepEqual(parseAppearancePreferences(JSON.stringify({ mode: 'space', season: 'invalid', hemisphere: 'south' })), {
    ...DEFAULT_APPEARANCE, mode: 'space', season: 'auto', hemisphere: 'south', motion: true,
  });
});

test('motion defaults respect the device preference and an explicit saved pause is retained', () => {
  assert.equal(parseAppearancePreferences(null, true).motion, false);
  assert.equal(parseAppearancePreferences('{bad json', true).motion, false);
  assert.equal(parseAppearancePreferences(JSON.stringify({ mode: 'space' }), true).motion, false);
  assert.equal(parseAppearancePreferences(JSON.stringify({ motion: false }), false).motion, false);
  assert.equal(DEFAULT_APPEARANCE.motion, true, 'parsing a device preference must not mutate shared defaults');
});


test('legacy settings migrate to the new Space and Light default without losing calendar or motion choices', () => {
  assert.deepEqual(parseAppearancePreferences(JSON.stringify({ mode: 'earth', season: 'winter', hemisphere: 'south', motion: false })), {
    ...DEFAULT_APPEARANCE, season: 'winter', hemisphere: 'south', motion: false,
  });
  assert.equal(DEFAULT_APPEARANCE.mode, 'space');
  assert.equal(DEFAULT_APPEARANCE.scheme, 'light');
  assert.equal(DEFAULT_APPEARANCE.palette, 'classic');
  assert.equal(DEFAULT_APPEARANCE.artwork, 'monochrome');
});

test('modern appearance settings preserve independent atmosphere, brightness, palette, and artwork choices', () => {
  const settings = { ...DEFAULT_APPEARANCE, mode: 'earth', scheme: 'dark', palette: 'seasonal', artwork: 'color' };
  assert.deepEqual(parseAppearancePreferences(JSON.stringify(settings)), settings);
  const invalid = parseAppearancePreferences(JSON.stringify({ mode: 'earth', scheme: 'invalid', palette: 'invalid', artwork: 'invalid' }));
  assert.equal(invalid.scheme, 'light');
  assert.equal(invalid.palette, 'classic');
  assert.equal(invalid.artwork, 'monochrome');
});
