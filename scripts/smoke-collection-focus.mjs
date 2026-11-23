import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createVercelApp } from '../api/index.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'turbo-collection-focus-'));
const vite = await createServer({ root, configFile: false, cacheDir: path.join(temporary, 'vite'), plugins: [react()], server: { middlewareMode: true, hmr: false } });
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.get('/focus-blank.html', (_request, response) => response.type('html').send('<title>Isolated focus fixture</title>'));
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(vite.middlewares);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const ids = ['TurboChat', 'TurboGames', 'TurboStocks'].map(title => catalog.find(project => project.title === title).id);
const errors = [];
let browser;

async function fixture(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/focus-blank.html`);
  await page.evaluate(ids => {
    localStorage.setItem('turbo-universe-saved-worlds', JSON.stringify(ids));
    localStorage.setItem('turbo-universe-recent-worlds', JSON.stringify(ids));
  }, ids);
  await page.goto(`${origin}/#collection`);
  await page.getByRole('button', { name: 'Unsave TurboChat', exact: true }).waitFor();
  return { context, page };
}

const activeLabel = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim());
async function savedView(page) {
  await page.getByRole('group', { name: 'Filter projects' }).getByRole('button', { name: /^Saved/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.project-grid .project-card').length === 3);
}
async function hold(context, page, key) {
  const holder = await context.newPage();
  await holder.goto(`${origin}/focus-blank.html`);
  await holder.evaluate(key => {
    window.pendingHold = navigator.locks.request(key, async () => {
      window.holdingLock = true;
      await new Promise(resolve => { window.releaseLock = resolve; });
    });
  }, key);
  await holder.waitForFunction(() => window.holdingLock);
  await page.bringToFront();
  return async () => { await holder.evaluate(() => window.releaseLock()); await holder.evaluate(() => window.pendingHold); await holder.close(); };
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  for (const width of [1440, 390]) {
    const { context, page } = await fixture(width);
    await savedView(page);
    const stars = page.locator('.project-grid .save-project-button');
    const nextLabel = await stars.nth(1).getAttribute('aria-label');
    await stars.first().focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.project-grid .project-card').length === 2);
    assert.equal(await activeLabel(page), nextLabel, 'Unsave keeps keyboard focus on the nearest remaining card');
    const previousLabel = await stars.first().getAttribute('aria-label');
    await stars.last().focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.project-grid .project-card').length === 1);
    assert.equal(await activeLabel(page), previousLabel);
    await page.keyboard.press('Enter');
    await page.locator('.project-grid .project-card').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.closest('.filter-empty') !== null);
    assert.match(await activeLabel(page), /Show all worlds/);
    await context.close();

    const recent = await fixture(width);
    await recent.page.getByRole('button', { name: 'Clear recent worlds', exact: true }).focus();
    await recent.page.keyboard.press('Enter');
    await recent.page.locator('.recent-worlds').waitFor({ state: 'hidden' });
    await recent.page.waitForFunction(() => document.activeElement?.closest('[aria-label="Filter projects"]') !== null);
    assert.equal(await recent.page.locator('.project-grid .save-project-button[aria-pressed="true"]').count(), 3);
    await recent.context.close();
    console.log(`PASS: keyboard Unsave/empty recovery and Clear recent at ${width}px`);
  }
  {
    const { context, page } = await fixture(); await savedView(page);
    const release = await hold(context, page, 'turbo-universe-saved-worlds');
    await page.locator('.project-grid .save-project-button').first().focus(); await page.keyboard.press('Enter');
    const search = page.getByRole('searchbox', { name: 'Search projects', exact: true });
    await search.fill('Turbo'); await release();
    await page.waitForFunction(() => document.querySelectorAll('.project-grid .project-card').length === 2);
    assert.equal(await search.evaluate(element => document.activeElement === element), true, 'A delayed removal cannot steal newer search focus');
    assert.equal(await search.inputValue(), 'Turbo');
    await context.close(); console.log('PASS: delayed Unsave preserves newer search focus');
  }
  {
    const { context, page } = await fixture();
    const release = await hold(context, page, 'turbo-universe-recent-worlds');
    await page.getByRole('button', { name: 'Clear recent worlds', exact: true }).focus(); await page.keyboard.press('Enter');
    const story = page.getByRole('button', { name: 'The story', exact: true }); await story.click();
    await page.locator('.story-heading').waitFor(); await release();
    await page.waitForFunction(() => localStorage.getItem('turbo-universe-recent-worlds') === null);
    assert.equal(await story.evaluate(element => document.activeElement === element), true, 'A completed clear cannot focus a later view');
    await context.close(); console.log('PASS: delayed Clear recent preserves a later view');
  }
  for (const kind of ['saved', 'recent']) {
    const { context, page } = await fixture();
    if (kind === 'saved') await savedView(page);
    const key = kind === 'saved' ? 'turbo-universe-saved-worlds' : 'turbo-universe-recent-worlds';
    const release = await hold(context, page, key);
    const origin = kind === 'saved' ? page.locator('.project-grid .save-project-button').first() : page.getByRole('button', { name: 'Clear recent worlds', exact: true });
    await origin.focus(); await page.keyboard.press('Enter');
    await page.evaluate(() => { location.hash = '#universe'; });
    await page.waitForFunction(() => document.title.includes('One mind'));
    await release();
    if (kind === 'saved') await page.waitForFunction(() => document.querySelectorAll('.project-grid .project-card').length === 2);
    else await page.locator('.recent-worlds').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'History navigation cancels restoration even when both views reuse the same collection section');
    await context.close(); console.log(`PASS: delayed ${kind} action respects shared-section history navigation`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await vite.close();
  await rm(temporary, { recursive: true, force: true });
}
