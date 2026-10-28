import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = path.resolve(root, '../local-ai-browser');
const screenshots = path.resolve(root, '../local-ai-checks');
const origin = 'http://127.0.0.1:5098';
const modelRequest = url => /huggingface\.co\/.*Qwen2.5|raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs/.test(url);
const weightRequest = url => /params_shard_\d+\.bin(?:\?|$)/.test(url);
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(path.join(root, 'dist')));
const server = app.listen(5098, '127.0.0.1');
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : undefined);
let context;
let releaseHeld;
const report = { adapter: null, replies: [], checks: [] };

async function openAI(page) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Open AI studio', exact: true }).click();
  await page.getByRole('button', { name: 'Download free model', exact: true }).waitFor();
}

async function ask(page, question) {
  const log = page.getByRole('log', { name: 'Local AI conversation', exact: true });
  await page.getByLabel('Your prompt', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Local AI conversation"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 100_000 });
  const alert = page.locator('.ai-local-error');
  assert.equal(await alert.count(), 0, `Generation failed: ${await alert.allTextContents()}`);
  const text = await log.locator('.ai-message-assistant p').last().innerText();
  assert.ok(text.trim().length > 12, 'A real completion must contain meaningful text');
  assert.doesNotMatch(text, /^(Thinking…|Generation stopped\.)$/);
  console.log(JSON.stringify({ question, answer: text }));
  report.replies.push({ question, answer: text });
  return text;
}

try {
  await mkdir(screenshots, { recursive: true });
  context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, serviceWorkers: 'block',
    viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce',
  });
  const unsupported = await context.browser().newContext({ serviceWorkers: 'block' });
  const unsupportedDownloads = [];
  unsupported.on('request', request => { if (modelRequest(request.url())) unsupportedDownloads.push(request.url()); });
  await unsupported.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined }));
  const unsupportedPage = await unsupported.newPage();
  await openAI(unsupportedPage);
  await unsupportedPage.getByRole('button', { name: 'Download free model', exact: true }).click();
  await unsupportedPage.getByRole('alert').filter({ hasText: 'does not support WebGPU' }).waitFor();
  assert.deepEqual(unsupportedDownloads, []);
  report.checks.push('Unsupported browser reports capability error without downloading a model');
  await unsupported.close();

  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  context.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  let holdFirstWeight = true;
  let heldWeight;
  let notifyHeld;
  const sawHeld = new Promise(resolve => { notifyHeld = resolve; });
  const hold = new Promise(resolve => { releaseHeld = resolve; });
  let blockExternal = false;
  const blockedExternal = [];
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (holdFirstWeight && weightRequest(url)) {
      holdFirstWeight = false;
      heldWeight = url;
      notifyHeld();
      await hold;
      await route.abort('aborted').catch(() => {});
      return;
    }
    if (blockExternal && !url.startsWith(origin + '/')) {
      blockedExternal.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await openAI(page);
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.info.isFallbackAdapter, f16: adapter.features.has('shader-f16') } : null;
  });
  assert.ok(report.adapter && !report.adapter.fallback, 'The real graphics adapter must be available');
  await page.waitForTimeout(700);
  assert.deepEqual(requests.filter(request => modelRequest(request.url)), [], 'Entering AI must not download a model');
  report.checks.push('No model requests before explicit download');

  // Remove only the first shard from a previous run so cancellation stays exercised.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (/Qwen2\.5.*params_shard_0\.bin/.test(request.url)) await cache.delete(request);
      }
    }
  });
  console.log('Checking download cancellation…');
  await page.getByRole('button', { name: 'Download free model', exact: true }).click();
  let heldTimeout;
  try {
    await Promise.race([sawHeld, new Promise((_, reject) => { heldTimeout = setTimeout(() => reject(new Error('No weight download was intercepted')), 90_000); })]);
  } finally {
    clearTimeout(heldTimeout);
  }
  await page.getByRole('button', { name: 'Cancel download', exact: true }).click();
  await page.getByRole('button', { name: 'Download free model', exact: true }).waitFor();
  releaseHeld();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.ai-local-error').count(), 0, 'Cancellation does not surface a stale load error');
  assert.equal(await page.getByText('Ready on this device', { exact: true }).count(), 0);
  report.checks.push(`Download cancellation invalidates the held load (${new URL(heldWeight).pathname.split('/').at(-1)})`);

  console.log('Downloading the real model and compiling for WebGPU…');
  await page.getByRole('button', { name: 'Download free model', exact: true }).click();
  await page.getByText('Ready on this device', { exact: true }).waitFor({ timeout: 310_000 });
  report.checks.push('Model downloaded and loaded after cancellation/retry');
  const requestCount = requests.length;
  const first = await ask(page, 'Explain why ice melts when it becomes warm, in two short sentences.');
  assert.match(first, /melt|solid|liquid/i, 'The ice answer must discuss the requested state change');
  assert.doesNotMatch(first, /sublimation/i, 'The ice answer must not confuse melting with sublimation');
  await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  const second = await ask(page, 'Suggest three cheerful names for a club about stars and planets.');
  assert.notEqual(first.trim(), second.trim(), 'Distinct prompts must produce different generated replies');
  assert.ok(requests.slice(requestCount).every(request => request.method === 'GET' && !new URL(request.url).pathname.startsWith('/api/')), 'Generation makes no provider or local API requests');

  blockExternal = true;
  await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  const invitation = await ask(page, 'Write a friendly one-sentence invitation to study together on Saturday.');
  assert.match(invitation, /Saturday/i, 'The invitation must mention the requested day');
  assert.match(invitation, /study|studying/i, 'The invitation must mention studying together');
  assert.deepEqual(blockedExternal, [], 'A loaded model generates without requesting external services');
  report.checks.push('Three real, dynamic replies; third succeeds with all external requests blocked');

  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px page has no horizontal overflow');
  assert.equal(await page.locator('.ai-local-section').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, '320px AI panel has no horizontal overflow');
  await page.screenshot({ path: path.join(screenshots, 'mobile-320.png'), fullPage: true });
  report.checks.push('Desktop and 320px layout verified');
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  await page.getByLabel('Your prompt', { exact: true }).fill('Write a long story about an astronaut exploring a sparkling new planet.');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await page.getByRole('button', { name: 'Stop reply', exact: true }).click();
  await page.getByRole('button', { name: 'Send prompt', exact: true }).waitFor();
  assert.equal(await page.locator('.ai-local-error').count(), 0);
  report.checks.push('Stop reply returns the composer to its usable state');
  await page.getByRole('button', { name: 'Unload model', exact: true }).click();
  await page.getByRole('button', { name: 'Download free model', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Send prompt', exact: true }).isDisabled(), true);
  report.checks.push('Unload disables generation');
  assert.deepEqual(errors, []);
  await writeFile(path.join(screenshots, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Local AI checks passed: capability, explicit download, cancellation/retry, real WebGPU inference, no provider requests, disconnected generation, stop, unload, and 320px layout.');
} catch (error) {
  const page = context?.pages()[0];
  if (page && !page.isClosed()) {
    console.error('AI panel at failure:', await page.locator('.ai-model-panel, .ai-local-error').allTextContents().catch(() => []));
    await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  releaseHeld?.();
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
