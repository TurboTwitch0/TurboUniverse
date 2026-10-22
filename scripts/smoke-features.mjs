import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(path.join(root, 'dist')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block', timezoneId: 'America/Chicago' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const published = new Date();
  let release = { id: 'first-feature-release', publishedAt: published.toISOString(), title: 'A new atmosphere', description: 'Earth, Space, and your favorite worlds.' };
  await page.clock.install({ time: published });
  await page.route('**/release.json', route => route.fulfill({ json: release }));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  await page.getByRole('status', { name: 'Latest update' }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'space' && document.documentElement.dataset.scheme === 'light' && document.documentElement.dataset.palette === 'classic');
  const lightBlue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'));
  await page.locator('.appearance-bar').getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'dark');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent')), lightBlue);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'dark');
  await page.locator('.appearance-bar').getByRole('button', { name: 'Light', exact: true }).click();

  const palettes = new Set();
  const backgrounds = new Set();
  for (const mode of ['earth', 'space']) {
    await page.getByRole('button', { name: mode === 'earth' ? 'Earth' : 'Space', exact: true }).click();
    await page.getByRole('button', { name: 'Appearance options', exact: true }).click();
    await page.getByLabel('Color palette', { exact: true }).selectOption('seasonal');
    assert.equal(await page.locator('.simple-art .mini-browser').count(), catalog.filter(project => !project.coverUrl).length, 'Projects use simple colorful illustrations in either atmosphere');
    assert.equal(await page.locator('.space-cover-image').count(), 0, 'Project cards no longer use landscape or space photos');
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      await page.getByLabel('Season', { exact: true }).selectOption(season);
      await page.waitForFunction(({ mode, season }) => document.documentElement.dataset.theme === mode && document.documentElement.dataset.season === season, { mode, season });
      const values = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return { palette: style.getPropertyValue('--theme-background') + style.getPropertyValue('--accent'), image: style.getPropertyValue('--hero-image') };
      });
      palettes.add(values.palette); backgrounds.add(values.image);
    }
    await page.getByLabel('Let the universe move').uncheck();
    await page.getByRole('button', { name: /That’s my atmosphere/ }).click();
  }
  assert.equal(palettes.size, 8, 'Every theme and season has a distinct palette');
  assert.equal(backgrounds.size, 8, 'Every theme and season has a distinct background');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'space' && document.documentElement.dataset.season === 'winter' && document.documentElement.dataset.motion === 'off');
  assert.equal(await page.locator('.orbit-world').first().evaluate(node => getComputedStyle(node).animationName), 'none');

  await page.getByRole('button', { name: 'Save TurboHome', exact: true }).click();
  await page.locator('.filters').getByRole('button', { name: /^Saved/ }).click();
  assert.equal(await page.locator('.project-card').count(), 1);
  await page.reload();
  await page.getByRole('button', { name: 'Unsave TurboHome', exact: true }).waitFor();
  await page.locator('.filters').getByRole('button', { name: /^Saved/ }).click();
  assert.equal(await page.locator('.project-card').count(), 1);
  await page.getByRole('link', { name: 'TurboUniverse home', exact: true }).click();
  await page.getByRole('button', { name: 'Discover a random world', exact: true }).click();
  const randomTitle = await page.getByRole('dialog').getByRole('heading').textContent();
  assert.ok(catalog.some(project => project.title === randomTitle), 'The orbit discovers a real project');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open orbit world TurboHome', exact: true }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  await page.getByRole('button', { name: 'World saved', exact: true }).click();
  await page.getByRole('button', { name: 'Save this world', exact: true }).waitFor();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Dismiss update announcement', exact: true }).click();
  await page.reload();
  await page.getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  assert.equal(await page.getByRole('status', { name: 'Latest update' }).count(), 0);
  release = { ...release, id: 'second-feature-release' };
  await page.reload();
  await page.getByRole('status', { name: 'Latest update' }).waitFor();
  await page.clock.fastForward(48 * 60 * 60 * 1000 + 1000);
  await page.getByRole('status', { name: 'Latest update' }).waitFor({ state: 'hidden' });

  await mkdir('/tmp/turbo-seasons-checks', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/turbo-seasons-checks/space-winter.png' });
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/turbo-seasons-checks/mobile-orbit.png' });

  const calendarContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'America/Chicago' });
  const calendar = await calendarContext.newPage();
  await calendar.clock.install({ time: new Date('2027-03-01T05:59:30.000Z') });
  await calendar.goto(origin);
  await calendar.waitForFunction(() => document.documentElement.dataset.season === 'winter');
  await calendar.clock.fastForward(61_000);
  await calendar.waitForFunction(() => document.documentElement.dataset.season === 'spring');
  await calendar.getByRole('button', { name: 'Appearance options', exact: true }).click();
  await calendar.getByLabel('Your hemisphere', { exact: true }).selectOption('south');
  await calendar.waitForFunction(() => document.documentElement.dataset.season === 'autumn');
  assert.deepEqual(errors, []);
  console.log('Feature checks passed: Space+Light defaults, distinct/persisted light and dark blues, simple colorful project covers, seasonal themes, saved worlds, orbit discovery, announcements and mobile layout.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
