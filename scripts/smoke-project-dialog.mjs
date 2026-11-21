import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createVercelApp } from '../api/index.mjs';

// Exercise current source without rebuilding or replacing a production dist.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'turbo-project-dialog-'));
const vite = await createServer({ root, configFile: false, cacheDir: path.join(temporary, 'vite'), plugins: [react()], server: { middlewareMode: true, hmr: false } });
const firstKey = randomUUID(), nextKey = randomUUID();
const seed = () => ({ id: 'deletion-fixture', title: 'Deletion fixture', type: 'website', url: 'https://example.com/deletion', description: '', category: 'Tools', year: 2026, featured: false, createdAt: '2026-11-21T00:00:00.000Z' });
let rows = [];
const store = {
  list: async () => rows,
  add: async project => { rows.push(project); },
  remove: async id => { const project = rows.find(item => item.id === id); rows = rows.filter(item => item.id !== id); return project; },
  uploadAsset: async () => {}, deleteAsset: async () => {},
};
const makeApi = key => createVercelApp({ blobToken: 'isolated-project-dialog-fixture', adminKey: key, store });
let api = makeApi(firstKey);
const app = express();
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(vite.middlewares);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const failures = [];

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function login(page, key, initial = false) {
  if (initial) await page.goto(origin);
  await page.getByRole('button', { name: 'Manage collection', exact: true }).click();
  await page.getByLabel('Owner key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
  await page.getByRole('button', { name: 'Add project', exact: true }).waitFor();
}
async function frameSettled(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function runCase(name, check) {
  rows = [seed()]; api = makeApi(firstKey);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const errors = [];
  try {
    await context.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(`${origin}/`) ? route.abort() : route.continue());
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await check(page);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL: ${name}: ${error.message}`);
  } finally { await context.close(); }
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  await runCase('ordinary add saves, refreshes the collection, and closes its own form', async page => {
    await login(page, firstKey, true);
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    await page.getByLabel('Project name').fill('Ordinary added world');
    await page.getByLabel('Project link').fill('https://example.com/ordinary-add');
    await page.getByRole('button', { name: 'Add to the universe', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'View Ordinary added world', exact: true }).waitFor();
    assert.equal(rows.filter(project => project.title === 'Ordinary added world').length, 1);
  });

  await runCase('a pending file read cannot replace a partial import retry list or progress', async page => {
    await page.addInitScript(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        if (this.name !== 'replacement.json') return original.call(this);
        return new Promise(resolve => { window.releaseImportRead = async () => resolve(await original.call(this)); });
      };
    });
    await login(page, firstKey, true);
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    await page.getByRole('button', { name: 'Bulk import', exact: true }).click();
    const textarea = page.getByLabel('Or paste project links');
    await textarea.fill(JSON.stringify([{ title: 'Original saved entry', url: 'https://example.com/original-a' }, { title: 'Original unsaved entry', url: 'https://example.com/original-b' }]));
    await page.getByLabel('Import project list', { exact: true }).setInputFiles({ name: 'replacement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ title: 'Unrelated replacement entry', url: 'https://example.com/replacement' }])) });
    await page.waitForFunction(() => typeof window.releaseImportRead === 'function');
    const pending = deferred();
    let posts = 0;
    await page.route(`${origin}/api/projects`, route => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      return posts === 2 ? pending.resolve(route) : route.continue();
    });
    await page.getByRole('button', { name: 'Import projects', exact: true }).click();
    const second = await pending.promise;
    assert.match(await textarea.inputValue(), /Original unsaved entry/);
    await page.evaluate(() => window.releaseImportRead());
    await frameSettled(page);
    await second.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Local fixture POST failure.' }) });
    await page.getByRole('alert').filter({ hasText: 'remaining projects are ready to retry' }).waitFor();
    assert.match(await textarea.inputValue(), /Original unsaved entry/, 'The unsaved original entry remains available for retry');
    assert.doesNotMatch(await textarea.inputValue(), /Unrelated replacement entry/);
    assert.equal(await page.locator('.import-progress').innerText(), '1 of 2 projects saved');
    await page.getByRole('button', { name: 'Import projects', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(posts, 3, 'Retry posts only the one unsaved original entry');
    assert.equal(rows.filter(project => project.title === 'Original saved entry').length, 1);
    assert.equal(rows.filter(project => project.title === 'Original unsaved entry').length, 1);
    assert.equal(rows.some(project => project.title === 'Unrelated replacement entry'), false);
  });

  for (const operation of ['add', 'import']) {
    await runCase(`an expired old ${operation} preserves the new owner draft and refreshes accepted writes once`, async page => {
      await login(page, firstKey, true);
      const pendingDelete = deferred();
      await page.route(`${origin}/api/projects/deletion-fixture`, route => pendingDelete.resolve(route));
      await page.getByRole('button', { name: 'View Deletion fixture', exact: true }).click();
      await page.getByRole('button', { name: 'Remove project', exact: true }).click();
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      const deletion = await pendingDelete.promise;
      // This close control intentionally remains available during deletion.
      await page.getByRole('button', { name: 'Close project', exact: true }).click();
      await page.getByRole('button', { name: 'Add project', exact: true }).click();
      const pendingPost = deferred(), postedKeys = [];
      let catalogLoads = 0;
      page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/projects') catalogLoads += 1; });
      await page.route(`${origin}/api/projects`, async route => {
        if (route.request().method() !== 'POST') return route.continue();
        postedKeys.push(route.request().headers().authorization);
        if (postedKeys.length === 1) pendingPost.resolve({ route, response: await route.fetch() });
        else await route.continue();
      });
      if (operation === 'add') {
        await page.getByLabel('Project name').fill('Original committed add');
        await page.getByLabel('Project link').fill('https://example.com/original-add');
        await page.getByRole('button', { name: 'Add to the universe', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Bulk import', exact: true }).click();
        await page.getByLabel('Or paste project links').fill(JSON.stringify([{ title: 'Original import first', url: 'https://example.com/import-one' }, { title: 'Original import remaining', url: 'https://example.com/import-two' }]));
        await page.getByRole('button', { name: 'Import projects', exact: true }).click();
      }
      const accepted = await pendingPost.promise;
      assert.equal(accepted.response.status(), 201);
      // Switching actual isolated API instances models rotation between server
      // deployments: the accepted write stays valid, the old delete is denied.
      api = makeApi(nextKey);
      const rejected = await deletion.fetch();
      assert.equal(rejected.status(), 401);
      await deletion.fulfill({ response: rejected });
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await login(page, nextKey);
      await page.getByRole('button', { name: 'Add project', exact: true }).click();
      await page.getByLabel('Project name').fill('Keep this newer owner draft');
      const beforeRefresh = catalogLoads;
      const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/projects');
      await accepted.route.fulfill({ response: accepted.response });
      await refreshed;
      await frameSettled(page);
      assert.equal(postedKeys.length, 1, 'An unmounted import must not send another project with the new owner key');
      assert.equal(await page.getByRole('dialog').count(), 1, 'A completed old request cannot dismiss the new dialog');
      assert.equal(await page.getByLabel('Project name').inputValue(), 'Keep this newer owner draft');
      assert.equal(catalogLoads - beforeRefresh, 1, 'Known accepted writes refresh the public collection once');
      assert.equal(rows.length, 2, 'The accepted project remains saved without replay or rollback');
    });
  }
  assert.deepEqual(failures, [], 'Project dialog browser regressions');
  console.log('Project dialog browser checks passed: add, partial retry, deferred file reads, session expiry, and stale import cancellation.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await vite.close();
  await rm(temporary, { recursive: true, force: true });
}
