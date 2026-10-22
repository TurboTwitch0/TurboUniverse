import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const servers = [];
function mockStore() {
  const projects = new Map(catalog.map(project => [project.id, { ...project }]));
  const assets = new Map();
  return {
    list: async () => [...projects.values()].reverse(),
    add: async project => { projects.set(project.id, project); return project; },
    remove: async id => { const project = projects.get(id); projects.delete(id); return project || null; },
    uploadAsset: async (name, bytes) => assets.set(name, bytes),
    readAsset: async name => assets.get(name) || null,
    deleteAsset: async name => assets.delete(name),
  };
}
async function fixture(options, observe = () => {}) {
  const app = express();
  const api = createVercelApp(options);
  app.use((request, response, next) => {
    observe(request);
    if (request.path.startsWith('/api/') || request.path.startsWith('/uploads/')) return api(request, response, next);
    next();
  });
  app.use(express.static(path.join(root, 'dist')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;
try {
  const publicOrigin = await fixture({ blobToken: '', adminKey: '' });
  const key = randomUUID();
  const store = mockStore();
  let publicRequestHadKey = false;
  let writeRequests = 0;
  const ownerOrigin = await fixture({ blobToken: 'isolated-browser-fixture', adminKey: key, store }, request => {
    if (request.path === '/api/projects' && request.method === 'GET' && request.headers.authorization) publicRequestHadKey = true;
    if (request.path === '/api/projects' && request.method === 'POST') writeRequests += 1;
  });
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await page.goto(publicOrigin);
  await page.getByRole('heading', { name: 'TurboHome', exact: true }).waitFor();
  assert.equal(await page.locator('.project-card').count(), 30);
  assert.equal(await page.getByRole('button', { name: 'Add project', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Manage collection', exact: true }).count(), 0);
  assert.equal(await page.locator('.add-world-card').count(), 0);
  await page.getByRole('button', { name: 'View TurboHome', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Remove project', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await page.getByText('Explore the collection. New worlds are added by Turbo.', { exact: true }).waitFor();
  console.log('Public Vercel mode: 30 projects, no mutation controls, no storage credentials required.');

  await page.goto(ownerOrigin);
  await page.getByRole('button', { name: 'Manage collection', exact: true }).click();
  await page.getByLabel('Owner key', { exact: true }).fill('an-incorrect-fixture-key');
  await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'That owner key wasn’t recognized.' }).waitFor();
  await page.getByLabel('Owner key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
  await page.getByRole('button', { name: 'Add project', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Add project', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  assert.equal(publicRequestHadKey, false, 'The owner credential is never sent with public project-list requests');

  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await page.getByText('ZIP, HTML, APK, PDF · under 4 MB combined', { exact: true }).waitFor();
  await page.getByLabel('Project name', { exact: true }).fill('Owner browser project');
  await page.getByLabel('Project link').fill('https://example.com/owner-fixture');
  await page.getByLabel('Project file', { exact: true }).setInputFiles({ name: 'oversized.html', mimeType: 'text/html', buffer: Buffer.alloc(4_000_000, 65) });
  await page.getByRole('button', { name: 'Add to the universe', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'under 4 MB combined' }).waitFor();
  assert.equal(writeRequests, 0, 'An oversized upload is rejected before sending a request');
  await page.getByLabel('Project file', { exact: true }).setInputFiles({ name: 'owner-project.html', mimeType: 'text/html', buffer: Buffer.from('<h1>Owner upload</h1>') });
  await page.getByLabel('Cover image', { exact: true }).setInputFiles(path.join(root, 'public/icon-192.png'));
  await page.getByRole('button', { name: 'Add to the universe', exact: true }).click();
  await page.getByRole('heading', { name: 'Owner browser project', exact: true }).waitFor();
  assert.equal(writeRequests, 1);
  assert.equal((await store.list()).length, 31);
  await page.getByRole('button', { name: 'View Owner browser project', exact: true }).click();
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download project', exact: true }).click();
  assert.equal((await downloadReady).suggestedFilename(), 'owner-project.html');
  await page.getByRole('button', { name: 'Remove project', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await store.list()).length, 30);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Manage collection', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add project', exact: true }).count(), 0);
  assert.equal(await page.locator('.add-world-card').count(), 0);
  await page.reload();
  await page.getByRole('button', { name: 'Manage collection', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(runtimeErrors, []);
  console.log('Owner Vercel mode: rejected bad key, authenticated/reloaded, enforced upload limits, uploaded/downloaded/deleted, signed out, no public bearer exposure, mobile layout passed.');
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
}
