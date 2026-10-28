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

  const orbitPlacement = await page.locator('.orbit-scene').evaluate(scene => ({
    top: scene.getBoundingClientRect().top,
    heroBottom: document.querySelector('.hero').getBoundingClientRect().bottom,
    insideHero: !!scene.closest('.hero'),
  }));
  assert.equal(orbitPlacement.insideHero, false, 'Neptune has its own discovery section');
  assert.ok(orbitPlacement.top >= orbitPlacement.heroBottom, 'Neptune appears below the cinematic title');

  const popular = page.locator('.popular-worlds');
  const destinations = [
    { title: 'TurboChat', url: 'https://turbo-chat-five.vercel.app/' },
    { title: 'TurboGames', url: 'https://turbogames.vercel.app/' },
    { title: 'TurboStocks', url: 'https://turbostocks.vercel.app/' },
    { title: 'Orbit Study', url: 'https://studyorbitv1.vercel.app/' },
  ];
  assert.deepEqual(await popular.locator('.popular-world-name strong').allTextContents(), destinations.map(item => item.title));
  assert.equal(await popular.getByRole('button', { name: /^Discover / }).count(), 4);
  for (const destination of destinations) {
    await popular.getByRole('button', { name: `Discover ${destination.title}`, exact: true }).click();
    const detail = page.getByRole('dialog');
    await detail.getByRole('heading', { name: destination.title, exact: true }).waitFor();
    assert.equal(await detail.getByRole('link', { name: /^(Explore (website|app)|View project on GitHub)$/ }).getAttribute('href'), destination.url, 'Popular destinations retain their verified project links');
    assert.doesNotMatch(await detail.locator('.detail-content > p').textContent(), /Part of the Turbo universe, shared on TurboHome/);
    await page.keyboard.press('Escape');
  }

  const firstCover = page.locator('.project-card .cinematic-project-art').first();
  await firstCover.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const image = document.querySelector('.project-card .cinematic-project-art > img');
    return image?.complete && image.naturalWidth > 0;
  });
  const titlePlacement = await firstCover.evaluate(cover => {
    const bounds = cover.getBoundingClientRect();
    const title = cover.querySelector('h3').getBoundingClientRect();
    return { x: Math.abs(title.x + title.width / 2 - bounds.x - bounds.width / 2), y: Math.abs(title.y + title.height / 2 - bounds.y - bounds.height / 2) };
  });
  assert.ok(titlePlacement.x < 3 && titlePlacement.y < 3, 'The project name sits in the center of its image');

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
    const covers = await page.locator('.project-card .cinematic-project-art > img').evaluateAll(images => images.map(image => image.getAttribute('src')));
    assert.equal(covers.length, catalog.length, 'Every project has a cinematic image cover');
    assert.ok(covers.every(src => mode === 'earth' ? src.startsWith('/images/earth-') : /^\/images\/(?:space-|cinematic-)/.test(src)), 'Project backgrounds match the selected Earth or Space atmosphere');
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
  const randomTitle = await page.getByRole('dialog').locator('.detail-content > h2').textContent();
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
  console.log('Feature checks passed: Space+Light defaults, centered cinematic image titles, four real popular destinations, Neptune below the hero, distinct/persisted light and dark blues, seasonal themes, saved worlds, orbit discovery, announcements and mobile layout.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
