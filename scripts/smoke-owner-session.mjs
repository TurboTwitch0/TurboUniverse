import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const storageKey = 'turbo-universe-owner-key';
const key = randomUUID();
const app = express();
const api = createVercelApp({ blobToken: 'isolated-owner-session-fixture', adminKey: key, store: { list: async () => [] } });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(path.join(root, 'dist')));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function holdAdmin(page, status = 200, matches = () => true) {
  const received = page.waitForRequest(request => new URL(request.url()).pathname === '/api/admin' && matches(request));
  const release = deferred();
  const completed = deferred();
  let held = false;
  const handler = async route => {
    if (held || !matches(route.request())) return route.continue();
    held = true;
    await release.promise;
    try {
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { authenticated: true } : { error: 'Owner access is required.' }) });
    } catch {
      // A dismissed or timed-out request is already aborted in the browser.
    } finally { completed.resolve(); }
  };
  await page.route('**/api/admin', handler);
  return {
    received,
    async finish() {
      release.resolve();
      await completed.promise;
      await page.unroute('**/api/admin', handler);
    },
  };
}

async function openLogin(page, origin) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Manage collection', exact: true }).click();
  await page.getByLabel('Owner key', { exact: true }).fill(key);
}

const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROMIUM_PATH || [
  '/usr/bin/chromium',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(candidate => existsSync(candidate));
const runtimeErrors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });

  for (const dismissal of ['Escape', 'close button', 'backdrop']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await openLogin(page, origin);
    const pending = await holdAdmin(page);
    await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
    await pending.received;
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'close button') await page.getByRole('button', { name: 'Close owner sign-in', exact: true }).click();
    else await page.locator('.dialog-backdrop').click({ position: { x: 1, y: 1 } });
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await pending.finish();
    assert.equal(await page.evaluate(name => sessionStorage.getItem(name), storageKey), null, `${dismissal} must not save a late credential`);
    assert.equal(await page.getByRole('button', { name: 'Manage collection', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 0);
    await context.close();
  }
  console.log('Owner sign-in: Escape, close button, and backdrop dismiss pending requests without signing in.');

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await openLogin(page, origin);
    await page.clock.install();
    const pending = await holdAdmin(page);
    await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
    await pending.received;
    await page.clock.fastForward(15_001);
    await page.getByRole('alert').filter({ hasText: 'Sign-in took too long. Please try again.' }).waitFor();
    assert.equal(await page.getByLabel('Owner key', { exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Manage my universe', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(name => sessionStorage.getItem(name), storageKey), null);
    await pending.finish();
    await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
    await page.getByRole('button', { name: 'Add project', exact: true }).waitFor();
    assert.equal(await page.evaluate(name => sessionStorage.getItem(name), storageKey), key);
    await context.close();
  }
  console.log('Owner sign-in: a stalled request times out and a retry can authenticate.');

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => runtimeErrors.push(error.message));
    const oldKey = randomUUID();
    await page.addInitScript(({ storageKey, oldKey }) => {
      sessionStorage.setItem(storageKey, oldKey);
      window.__ownerSessionExpired = 0;
      window.__staleOwnerResponseReturned = false;
      window.addEventListener('turbo-owner-session-expired', () => { window.__ownerSessionExpired += 1; });
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        if (new Headers(init?.headers).get('Authorization') === `Bearer ${oldKey}`) window.__staleOwnerResponseReturned = true;
        return response;
      };
    }, { storageKey, oldKey });
    const stale = await holdAdmin(page, 401, request => request.headers().authorization === `Bearer ${oldKey}`);
    await openLogin(page, origin);
    await stale.received;
    await page.getByRole('button', { name: 'Manage my universe', exact: true }).click();
    await page.getByRole('button', { name: 'Add project', exact: true }).waitFor();
    await stale.finish();
    await page.waitForFunction(() => window.__staleOwnerResponseReturned);
    const session = await page.evaluate(name => ({ key: sessionStorage.getItem(name), expired: window.__ownerSessionExpired }), storageKey);
    assert.equal(session.key, key, 'A stale rejection must preserve the newly accepted owner key');
    assert.equal(session.expired, 0, 'A stale rejection must not expire the newly accepted session');
    assert.equal(await page.getByRole('button', { name: 'Add project', exact: true }).count(), 1);
    await context.close();
  }
  console.log('Owner sign-in: a delayed rejection of an old key preserves a newer successful session.');
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
