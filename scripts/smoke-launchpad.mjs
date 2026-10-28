import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';

const RECENT_KEY = 'turbo-universe-recent-worlds';
const CHAT_URL = 'https://turbo-chat-five.vercel.app/';
const WATCH_URL = 'https://github.com/TurboTwitch0/TurboWatch';
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((req, res, next) => req.path.startsWith('/api/') ? api(req, res, next) : next());
app.use(express.static('dist'));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

async function assertExternalLink(link, url) {
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.ok((await link.getAttribute('rel') || '').split(/\s+/).includes('noopener'));
}

async function viewWorld(page, title) {
  await page.locator('.project-grid').getByRole('button', { name: `View ${title}`, exact: true }).click();
  await page.getByRole('dialog', { name: title, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close project', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

async function recentTitles(page) {
  return page.locator('.recent-world-details strong').allTextContents();
}

try {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executablePath = process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  // The launch test uses a local response at the canonical URL so it does not depend on the remote app.
  await context.route(`${CHAT_URL}**`, route => route.fulfill({ contentType: 'text/html', body: '<title>TurboChat launch check</title>' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  const grid = page.locator('.project-grid');
  await grid.getByRole('button', { name: 'View TurboChat', exact: true }).waitFor();
  assert.equal(await page.locator('.recent-worlds').count(), 0);
  await grid.getByRole('button', { name: 'Save TurboChat', exact: true }).click();
  await viewWorld(page, 'TurboChat');
  await page.getByRole('button', { name: 'Revisit TurboChat', exact: true }).waitFor();
  assert.deepEqual(await recentTitles(page), ['TurboChat']);

  const launch = grid.getByRole('link', { name: 'Launch TurboChat', exact: true });
  await assertExternalLink(launch, CHAT_URL);
  await assertExternalLink(page.locator('.recent-worlds').getByRole('link', { name: 'Launch recent TurboChat', exact: true }), CHAT_URL);
  const popupPromise = page.waitForEvent('popup');
  await launch.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), CHAT_URL);
  assert.equal(await popup.evaluate(() => window.opener), null);
  await popup.close();

  await viewWorld(page, 'TurboGames');
  assert.deepEqual(await recentTitles(page), ['TurboGames', 'TurboChat']);
  await page.getByRole('button', { name: 'Revisit TurboChat', exact: true }).click();
  await page.getByRole('dialog', { name: 'TurboChat', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close project', exact: true }).click();
  assert.deepEqual(await recentTitles(page), ['TurboChat', 'TurboGames']);
  await page.reload();
  await page.getByRole('button', { name: 'Revisit TurboChat', exact: true }).waitFor();
  assert.deepEqual(await recentTitles(page), ['TurboChat', 'TurboGames']);
  await grid.getByRole('button', { name: 'Unsave TurboChat', exact: true }).waitFor();

  const source = grid.getByRole('link', { name: 'View source for TurboWatch', exact: true });
  await assertExternalLink(source, WATCH_URL);
  assert.match(await source.locator('..').innerText(), /SETUP PENDING/);
  await viewWorld(page, 'TurboWatch');
  await assertExternalLink(page.locator('.recent-worlds').getByRole('link', { name: 'View source for TurboWatch', exact: true }), WATCH_URL);

  const screenshots = path.resolve('../launchpad-checks');
  await mkdir(screenshots, { recursive: true });
  await page.locator('.recent-worlds').screenshot({ path: path.join(screenshots, 'desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.recent-worlds').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow at ${width}px`);
    assert.equal(await page.locator('.recent-worlds').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, `Recent worlds overflow at ${width}px`);
    const clipped = await page.locator('.recent-world').evaluateAll(elements => elements.some(element => element.scrollWidth > element.clientWidth + 1));
    assert.equal(clipped, false, `Recent world content overflow at ${width}px`);
    await page.screenshot({ path: path.join(screenshots, `mobile-${width}.png`) });
  }

  await page.getByRole('button', { name: 'Clear recent worlds', exact: true }).click();
  assert.equal(await page.locator('.recent-worlds').count(), 0);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), RECENT_KEY), null);
  await page.getByRole('group', { name: 'Filter projects' }).getByRole('button', { name: /^Saved/ }).click();
  assert.equal(await grid.locator('.project-card').count(), 1);
  await grid.getByRole('button', { name: 'View TurboChat', exact: true }).waitFor();
  await page.reload();
  await grid.getByRole('button', { name: 'Unsave TurboChat', exact: true }).waitFor();
  assert.equal(await page.locator('.recent-worlds').count(), 0);

  await page.evaluate(key => localStorage.setItem(key, '{bad json'), RECENT_KEY);
  await page.reload();
  await grid.getByRole('button', { name: 'View TurboChat', exact: true }).waitFor();
  assert.equal(await page.locator('.recent-worlds').count(), 0);
  await viewWorld(page, 'TurboChat');
  await page.getByRole('button', { name: 'Revisit TurboChat', exact: true }).waitFor();
  assert.deepEqual(errors, []);

  const blockedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await blockedContext.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage is blocked', 'SecurityError'); } });
  });
  const blockedPage = await blockedContext.newPage();
  const blockedErrors = [];
  blockedPage.on('pageerror', error => blockedErrors.push(error.message));
  await blockedPage.goto(origin);
  await viewWorld(blockedPage, 'TurboChat');
  await blockedPage.getByRole('button', { name: 'Revisit TurboChat', exact: true }).waitFor();
  await blockedPage.getByRole('button', { name: 'Clear recent worlds', exact: true }).click();
  assert.equal(await blockedPage.locator('.recent-worlds').count(), 0);
  assert.deepEqual(blockedErrors, []);
  await blockedContext.close();
  console.log('Launchpad: details, recent order and revisit, canonical secure launch, reload, clear preserving saved worlds, pending source links, malformed/blocked storage, desktop/390/320px passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
