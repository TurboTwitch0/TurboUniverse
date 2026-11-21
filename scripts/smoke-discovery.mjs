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
const screenshots = '/tmp/turbo-polish-checks';
let browser;

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releaseInitial;
  let requests = 0;
  const initial = new Promise(resolve => { releaseInitial = resolve; });
  await page.route('**/api/projects', async route => {
    requests += 1;
    if (requests === 1) {
      await initial;
      try { await route.fulfill({ json: { projects: catalog.slice(0, 1) } }); }
      catch { /* The newer refresh cancels this stale response. */ }
    } else await route.fulfill({ json: { projects: catalog } });
  });
  await page.goto(`${origin}/?campaign=discovery-check#collection`, { waitUntil: 'domcontentloaded' });
  await page.locator('.skeleton-card').first().waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(count => document.querySelectorAll('.project-card').length === count, catalog.length);
  releaseInitial();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.project-card').count(), catalog.length, 'A stale response cannot replace the newest catalog');
  await page.unroute('**/api/projects');
  await page.route('**/api/projects', route => route.fulfill({ status: 503, json: { error: 'Refresh failed' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText('Couldn’t refresh the collection. Showing your last loaded worlds.', { exact: true }).waitFor();
  assert.equal(await page.locator('.project-card').count(), catalog.length, 'Refresh errors keep the last successful catalog visible');
  await page.unroute('**/api/projects');
  await page.getByRole('button', { name: 'Retry refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Retry refresh', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  assert.equal(await page.locator('.project-card').count(), catalog.length);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, 'desktop.png') });

  const gamingCount = catalog.filter(project => project.category === 'Gaming').length;
  assert.ok(gamingCount > 0 && gamingCount < catalog.length);
  await page.getByLabel('Category', { exact: true }).selectOption('Gaming');
  await page.waitForFunction(count => document.querySelectorAll('.project-card').length === count, gamingCount);
  assert.ok((await page.locator('.project-card .project-tags').allTextContents()).every(text => text.includes('Gaming')), 'Category filtering shows only gaming projects');
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('Turbo Games');
  await page.getByRole('heading', { name: 'TurboGames', exact: true }).waitFor();
  assert.ok(await page.locator('.project-card').count() <= gamingCount, 'Multiple search terms combine with the chosen category');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.project-card').length === count, gamingCount);
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'Gaming', 'Clearing search preserves the selected category');
  await page.getByLabel('Sort worlds', { exact: true }).selectOption('az');
  const names = await page.locator('.project-card h3').allTextContents();
  const alphabetical = [...names].sort(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare);
  assert.deepEqual(names, alphabetical, 'Alphabetical sorting orders the visible projects');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.project-card').length === count, catalog.length);
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), 'all');
  assert.equal(await page.getByLabel('Sort worlds', { exact: true }).inputValue(), 'original');

  await page.getByRole('button', { name: 'The story', exact: true }).click();
  await page.locator('.story-heading').waitFor();
  assert.equal(new URL(page.url()).hash, '#story');
  await page.reload();
  await page.locator('.story-heading').waitFor();
  assert.match(await page.title(), /The story/);
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'main-content');
  assert.equal(new URL(page.url()).hash, '#story', 'Skip to content preserves the active section address');
  await page.reload();
  await page.locator('.story-heading').waitFor();
  await page.goBack();
  await page.locator('.collection-page').waitFor();
  await page.goForward();
  await page.locator('.story-heading').waitFor();
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Search projects');
  assert.equal(await page.locator('.story-heading').count(), 0, 'The search shortcut leaves the story and opens collection search');
  await page.screenshot({ path: path.join(screenshots, 'collection.png') });

  const chat = catalog.find(project => project.title === 'TurboChat');
  assert.ok(chat);
  await page.getByRole('button', { name: 'View TurboChat', exact: true }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'TurboChat', exact: true }).waitFor();
  let address = new URL(page.url());
  assert.equal(address.searchParams.get('world'), chat.id, 'Opening a project creates an addressable world URL');
  assert.equal(address.searchParams.get('campaign'), 'discovery-check', 'Opening a world preserves unrelated URL state');
  assert.equal(address.hash, '#collection');
  await page.getByRole('button', { name: 'Copy world link', exact: true }).click();
  await page.getByRole('button', { name: 'Link copied', exact: true }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const shared = new URL(copied);
  assert.equal(shared.origin, origin);
  assert.equal(shared.pathname, '/');
  assert.deepEqual([...shared.searchParams], [['world', chat.id]], 'Shared links exclude unrelated query parameters');
  assert.equal(shared.hash, '');

  await page.reload();
  await page.getByRole('dialog').getByRole('heading', { name: 'TurboChat', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).searchParams.has('world'), false, 'Closing details removes the world parameter');
  await page.waitForFunction(() => document.activeElement?.id === 'main-content');
  await page.getByRole('button', { name: 'View TurboChat', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.goBack();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.goForward();
  await page.getByRole('dialog').getByRole('heading', { name: 'TurboChat', exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('world'), chat.id, 'Browser Forward restores project details');

  await page.goto(copied);
  await page.getByRole('dialog').getByRole('heading', { name: 'TurboChat', exact: true }).waitFor();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.getByRole('button', { name: 'Copy world link', exact: true }).click();
  const fallback = page.getByRole('textbox', { name: 'World link', exact: true });
  await fallback.waitFor();
  assert.equal(await fallback.inputValue(), copied);
  assert.equal(await fallback.evaluate(input => input.readOnly), true);
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="World link"]');
    return input === document.activeElement && input.selectionStart === 0 && input.selectionEnd === input.value.length;
  });
  assert.equal(await page.getByRole('button', { name: 'Link copied', exact: true }).count(), 0, 'A blocked clipboard offers manual copying without claiming success');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const launch = page.getByRole('link', { name: 'Open TurboChat', exact: true });
  assert.equal(await launch.getAttribute('href'), chat.url);
  assert.equal(await launch.getAttribute('target'), '_blank');
  assert.match(await launch.getAttribute('rel'), /noopener/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile has no horizontal overflow');
  await page.screenshot({ path: path.join(screenshots, 'mobile.png') });
  await page.getByLabel('Category', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, 'mobile-collection.png') });
  await page.getByRole('button', { name: 'View TurboHome', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const related = dialog.getByRole('region', { name: 'Related worlds' });
  await related.waitFor();
  const choices = related.getByRole('button');
  assert.ok(await choices.count() > 0 && await choices.count() <= 3);
  const nextTitle = (await choices.first().getAttribute('aria-label')).replace('Explore related ', '');
  await choices.first().click();
  await page.getByRole('dialog').locator('.detail-content > h2').filter({ hasText: nextTitle }).waitFor();
  await page.goBack();
  await page.getByRole('dialog').getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('dialog').screenshot({ path: path.join(screenshots, 'mobile-related.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'View TurboHome');
  await page.goto(`${origin}/?world=unavailable-world&campaign=discovery-check#collection`);
  await page.getByText('This world isn’t in the current collection.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Browse worlds', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.has('world'), false);
  assert.equal(new URL(page.url()).searchParams.get('campaign'), 'discovery-check');
  assert.equal(await page.locator('.project-card').count(), catalog.length);
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.locator('.section-heading').click();
  assert.equal(await page.getByRole('button', { name: 'Toggle navigation', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.deepEqual(errors, [], 'Discovery and sharing produce no browser errors');
  console.log('Discovery smoke passed: category + multi-term search, clear/reset, alphabetical sort, keyboard search from story, shareable deep links, clipboard/manual copy, reload, browser Back/Forward, reloadable section navigation, related worlds, direct launch links, and mobile layout.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
