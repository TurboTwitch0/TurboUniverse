import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((req, res, next) => req.path.startsWith('/api/') ? api(req, res, next) : next());
app.use(express.static('dist'));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executablePath = process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const listing = await (await context.request.get(`${origin}/api/projects`)).json();
  assert.equal(listing.projects.length, catalog.length);
  for (const title of ['TurboWatch']) {
    const project = listing.projects.find(item => item.title === title);
    assert.equal(project.status, 'setup-pending');
    assert.ok(project.url.startsWith('https://github.com/TurboTwitch0/'));
  }
  await page.goto(origin);
  await page.getByRole('button', { name: 'Open AI studio', exact: true }).click();
  await page.getByRole('button', { name: 'Sample tour', exact: true }).click();
  await page.locator('.ai-notice').waitFor();
  assert.match(await page.locator('.ai-notice').innerText(), /does not generate AI answers/);
  await page.waitForLoadState('networkidle');
  const requests = [];
  page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(request.url()); });
  const prompt = page.getByLabel('Your prompt', { exact: true });
  const submit = page.getByRole('button', { name: 'Try demo', exact: true });
  await prompt.fill('   ');
  assert.equal(await submit.isDisabled(), true);
  for (const [mode, sample] of [['Chat', 'productive afternoon'], ['Writing', 'Hey everyone!'], ['Studying', 'Water cycle practice'], ['Coding', 'function add(a, b)'], ['Brainstorming', 'Orbit Crew']]) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.locator('.ai-starters button').click();
    assert.equal(await page.locator('.ai-message-user').count(), 1);
    assert.ok((await page.locator('.ai-message-sample').innerText()).includes(sample));
    assert.match(await page.locator('.ai-message-sample').innerText(), /Demo · sample reply/);
  }
  await prompt.fill('<script>window.badDemo = true</script> Custom question');
  await prompt.press('Control+Enter');
  assert.equal(await page.evaluate(() => window.badDemo), undefined);
  assert.match(await page.locator('.ai-message-sample').last().innerText(), /cannot generate a custom answer/);
  const reply = page.locator('.ai-message-sample').last();
  await reply.getByRole('button', { name: /^Copy sample reply/ }).click();
  await reply.getByText('Reply copied.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await reply.locator('p').innerText());
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await reply.getByRole('button', { name: /^Copy sample reply/ }).click();
  const manual = reply.getByRole('textbox', { name: /^Text of sample reply/ });
  await manual.waitFor();
  assert.equal(await manual.inputValue(), await reply.locator('p').innerText());
  assert.equal(await manual.evaluate(node => node.readOnly && node === document.activeElement && node.selectionStart === 0 && node.selectionEnd === node.value.length), true);
  await prompt.fill('First line');
  await prompt.press('End');
  await prompt.press('Enter');
  assert.equal(await prompt.inputValue(), 'First line\n', 'Plain Enter adds a new line');
  await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  assert.equal(await page.locator('.ai-message').count(), 0);
  assert.deepEqual(requests, []);
  const screenshots = path.resolve('../ai-checks');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await page.getByRole('button', { name: 'The universe', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await page.getByRole('button', { name: 'AI studio', exact: true }).click();
    await page.getByRole('button', { name: 'Sample tour', exact: true }).click();
    await prompt.fill('A'.repeat(2000));
    await submit.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.ai-message-user').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    await page.screenshot({ path: path.join(screenshots, `mobile-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('AI demo: five modes, honest samples, custom fallback, clear, reply copying/fallback, keyboard submit, no API requests, pending catalog links, desktop/390/320px passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
