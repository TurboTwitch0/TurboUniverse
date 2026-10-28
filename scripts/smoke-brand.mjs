import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const screenshots = path.resolve(process.env.BRAND_OUTPUT_DIR || path.join(root, '../../outputs/turbouniverse-brand-kit'));
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(path.join(root, 'dist')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const report = { screenshots, checks: [] };
let browser;

function passed(message) {
  report.checks.push(message);
  console.log(`PASS ${message}`);
}

async function newPage(viewport = { width: 1440, height: 1900 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const modelDownloads = [];
  page.on('pageerror', error => errors.push(error.message));
  // A visit to AI Studio must leave its explicitly requested model download idle.
  await context.route(/https:\/\/(?:[^/]+\.)?(?:huggingface\.co|hf\.co|mlc\.ai)\//, route => {
    modelDownloads.push(route.request().url());
    return route.abort();
  });
  return { page, context, errors, modelDownloads };
}

async function ready(page) {
  await page.locator('.project-grid').getByRole('button', { name: 'View TurboChat', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.width + 1, `${label}: ${dimensions.content}px content exceeds ${dimensions.width}px viewport`);
}

async function assertFocusVisible(page, label) {
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    const style = element && getComputedStyle(element);
    return {
      name: element?.getAttribute('aria-label') || element?.textContent?.trim(),
      visible: element?.matches(':focus-visible'),
      outline: style?.outlineStyle,
      outlineWidth: Number.parseFloat(style?.outlineWidth || '0'),
    };
  });
  assert.equal(focused.visible, true, `${label} has keyboard-visible focus`);
  assert.ok(focused.outline !== 'none' && focused.outlineWidth >= 1, `${label} has a visible outline: ${JSON.stringify(focused)}`);
}

async function tabTo(page, locator, label, limit = 70) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(element => element === document.activeElement)) {
      await assertFocusVisible(page, label);
      return;
    }
  }
  assert.fail(`Could not reach ${label} with Tab`);
}

async function assertReadableDialog(page, name) {
  const dialog = page.getByRole('dialog', { name, exact: true });
  await dialog.waitFor();
  await noOverflow(page, `${name} dialog`);
  const dimensions = await dialog.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, right: bounds.right, width: bounds.width, client: element.clientWidth, scroll: element.scrollWidth };
  });
  const viewport = page.viewportSize();
  assert.ok(dimensions.x >= -1 && dimensions.right <= viewport.width + 1, `${name} stays in the viewport`);
  assert.ok(dimensions.scroll <= dimensions.client + 1, `${name} content has no horizontal clipping`);
  const content = dialog.locator('.detail-content');
  if (await content.count()) {
    assert.equal(await dialog.locator('.detail-close').evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)', 'Project close control stays visible on dark cover art');
    const text = await content.locator('p').first().evaluate(element => {
      const style = getComputedStyle(element);
      return { color: style.color, size: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight) };
    });
    assert.ok(text.size >= 13 && text.lineHeight >= text.size * 1.3, `${name} uses legible paragraph sizing`);
    assert.notEqual(text.color, 'rgba(0, 0, 0, 0)', `${name} paragraph is visible`);
  }
  return dialog;
}

async function assertReducedMotion(page) {
  const animations = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
  assert.equal(animations, 0, 'Reduced motion disables running page animations');
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
}

async function capture(page, file, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screenshots, file), animations: 'disabled', ...options });
}

async function verifyBrand() {
  const { page, context, errors, modelDownloads } = await newPage();
  await page.goto(origin);
  await ready(page);
  assert.equal(await page.locator('.project-grid .project-card').count(), catalog.length);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'space');
  assert.equal(await page.locator('html').getAttribute('data-scheme'), 'light');
  await noOverflow(page, 'Desktop');
  await assertReducedMotion(page);
  await capture(page, 'product-desktop.png');
  passed('Desktop catalog, Space + Light defaults, and reduced motion');

  await tabTo(page, page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'The story', exact: true }), 'The story navigation');
  await page.keyboard.press('Enter');
  await page.locator('.story-heading').waitFor();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', { name: 'The universe', exact: true }).evaluate(element => element === document.activeElement), true);
  await assertFocusVisible(page, 'The universe navigation');
  await page.keyboard.press('Enter');
  await page.locator('.hero').waitFor();
  passed('Main navigation is reachable and operable with Tab and Enter');

  const showcase = page.locator('.universe-showcase');
  assert.deepEqual(await showcase.locator('.showcase-world-preview').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label'))), ['Preview TurboChat', 'Preview TurboGames', 'Preview TurboStocks'], 'Showcase prioritizes the current popular worlds');
  const preview = showcase.locator('.showcase-world-preview').first();
  const featuredTitle = (await preview.getAttribute('aria-label')).replace(/^Preview /, '');
  await tabTo(page, preview, `${featuredTitle} showcase preview`);
  await page.keyboard.press('Enter');
  await assertReadableDialog(page, featuredTitle);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.keyboard.press('Tab');
  const showcaseSave = showcase.getByRole('button', { name: `Save ${featuredTitle} from showcase`, exact: true });
  assert.equal(await showcaseSave.evaluate(element => element === document.activeElement), true, 'Showcase save follows preview in Tab order');
  await assertFocusVisible(page, `${featuredTitle} showcase save`);
  await page.keyboard.press('Enter');
  const showcaseUnsave = showcase.getByRole('button', { name: `Unsave ${featuredTitle} from showcase`, exact: true });
  assert.equal(await showcaseUnsave.getAttribute('aria-pressed'), 'true');
  await showcase.getByRole('group', { name: 'Quick collection views', exact: true }).getByRole('button', { name: /^Saved/ }).click();
  const grid = page.locator('.project-grid');
  await grid.getByRole('button', { name: `View ${featuredTitle}`, exact: true }).waitFor();
  assert.equal(await grid.locator('.project-card').count(), 1, 'Showcase Saved opens the actual saved collection');
  await grid.getByRole('button', { name: `Unsave ${featuredTitle}`, exact: true }).click();
  await page.getByRole('heading', { name: 'Keep your favorite worlds close.', exact: true }).waitFor();
  await page.getByRole('button', { name: 'The universe', exact: true }).click();

  await showcase.getByRole('group', { name: 'Quick collection views', exact: true }).getByRole('button', { name: 'Apps', exact: true }).click();
  const appsCount = catalog.filter(project => project.type === 'app').length;
  await page.waitForFunction(count => document.querySelectorAll('.project-grid .project-card').length === count, appsCount);
  assert.equal(await page.getByRole('group', { name: 'Filter projects', exact: true }).getByRole('button', { name: /^Apps/ }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'The universe', exact: true }).click();
  await showcase.getByRole('group', { name: 'Quick collection views', exact: true }).getByRole('button', { name: 'All worlds', exact: true }).click();
  assert.equal(await grid.locator('.project-card').count(), catalog.length);
  await page.getByRole('button', { name: 'The universe', exact: true }).click();

  const categoryPath = showcase.getByRole('group', { name: 'Explore ecosystem categories', exact: true }).getByRole('button').first();
  const categoryName = (await categoryPath.innerText()).trim();
  await categoryPath.click();
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), categoryName, 'Ecosystem path selects the actual collection category');
  assert.equal(await grid.locator('.project-card').count(), catalog.filter(project => project.category === categoryName).length);
  await page.getByRole('button', { name: 'The universe', exact: true }).click();
  await showcase.getByRole('button', { name: 'Explore the collection', exact: true }).click();
  assert.equal(await grid.locator('.project-card').count(), catalog.length);
  assert.equal(await page.locator('.collection-page').count(), 1);
  await page.getByRole('button', { name: 'The universe', exact: true }).click();
  await showcase.getByRole('button', { name: 'Try the space club AI starter', exact: true }).click();
  await page.getByRole('button', { name: 'Download free model', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Your prompt', { exact: true }).inputValue(), 'Suggest five imaginative names for a space club.');
  assert.equal(await page.getByRole('button', { name: 'Send prompt', exact: true }).isDisabled(), true);
  await page.waitForLoadState('networkidle');
  assert.deepEqual(modelDownloads, []);
  await page.getByRole('button', { name: 'The universe', exact: true }).click();
  passed('Showcase preview and save work by keyboard; All worlds, Apps, Saved, ecosystem categories, collection, and AI starter open real destinations');

  await page.getByLabel('Category', { exact: true }).selectOption('Gaming');
  const gamingCount = catalog.filter(project => project.category === 'Gaming').length;
  await page.waitForFunction(count => document.querySelectorAll('.project-grid .project-card').length === count, gamingCount);
  await page.getByRole('searchbox', { name: 'Search projects', exact: true }).fill('Turbo Games');
  await grid.getByRole('button', { name: 'View TurboGames', exact: true }).waitFor();
  assert.ok(await grid.locator('.project-card').count() <= gamingCount);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await grid.getByRole('button', { name: 'Save TurboChat', exact: true }).click();
  await page.getByRole('group', { name: 'Filter projects', exact: true }).getByRole('button', { name: /^Saved/ }).click();
  await grid.getByRole('button', { name: 'Unsave TurboChat', exact: true }).waitFor();
  assert.equal(await grid.locator('.project-card').count(), 1);
  await grid.getByRole('button', { name: 'View TurboChat', exact: true }).click();
  await assertReadableDialog(page, 'TurboChat');
  await capture(page, 'state-project-dialog.png');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  passed('Combined category and search, saved worlds, and readable project details');

  await page.reload();
  await ready(page);
  await grid.getByRole('button', { name: 'Unsave TurboChat', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open AI studio', exact: true }).click();
  await page.getByRole('button', { name: 'Download free model', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button', { name: 'Cancel download', exact: true }).count(), 0);
  assert.deepEqual(modelDownloads, [], 'Entering AI Studio does not request model files');
  await capture(page, 'state-ai-studio.png');
  passed('Saved worlds persist and AI Studio opens with model download idle');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    await ready(page);
    await noOverflow(page, `${width}px home`);
    if (width === 390) {
      await page.setViewportSize({ width, height: 2400 });
      await capture(page, 'product-mobile.png');
      await page.setViewportSize({ width, height: 1000 });
    }
    await tabTo(page, page.getByRole('button', { name: 'Toggle navigation', exact: true }), `${width}px mobile navigation toggle`);
    await page.keyboard.press('Enter');
    await noOverflow(page, `${width}px open navigation`);
    await page.getByRole('button', { name: 'AI studio', exact: true }).click();
    await page.getByRole('button', { name: 'Download free model', exact: true }).waitFor();
    await noOverflow(page, `${width}px AI Studio`);
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await page.getByRole('button', { name: 'The universe', exact: true }).click();
    await grid.getByRole('button', { name: 'View TurboChat', exact: true }).click();
    await assertReadableDialog(page, 'TurboChat');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Appearance options', exact: true }).click();
    await assertReadableDialog(page, 'A universe that feels like you.');
    if (width === 390) await capture(page, 'state-mobile-appearance.png');
    await page.keyboard.press('Escape');
    await assertReducedMotion(page);
    passed(`${width}px home, navigation, AI Studio, dialogs, and reduced motion`);
  }

  assert.deepEqual(errors, [], 'No browser runtime errors');
  assert.deepEqual(modelDownloads, [], 'No automatic model downloads');
  await context.close();
}

async function verifyLoadingAndRetry() {
  const { page, context, errors } = await newPage({ width: 390, height: 1000 });
  let release;
  const heldResponse = new Promise(resolve => { release = resolve; });
  await context.route('**/api/projects', async route => {
    await heldResponse;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: catalog }) });
  });
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Loading projects', { exact: true }).waitFor();
    await noOverflow(page, 'Loading catalog');
    await assertReducedMotion(page);
    await capture(page, 'state-loading.png');
  } finally {
    release();
  }
  await ready(page);
  assert.deepEqual(errors, []);
  await context.close();
  passed('Delayed API response presents a stable reduced-motion loading state');

  const retry = await newPage({ width: 390, height: 1000 });
  let requests = 0;
  await retry.context.route('**/api/projects', route => {
    requests += 1;
    return route.fulfill(requests === 1
      ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated unavailable catalog' }) }
      : { status: 200, contentType: 'application/json', body: JSON.stringify({ projects: catalog }) });
  });
  await retry.page.goto(origin);
  await retry.page.getByRole('heading', { name: 'We lost the signal.', exact: true }).waitFor();
  await retry.page.getByRole('alert').waitFor();
  await noOverflow(retry.page, 'Failed catalog');
  await capture(retry.page, 'state-error.png');
  await retry.page.locator('.projects-section .empty-state').getByRole('button', { name: 'Try again', exact: true }).click();
  await ready(retry.page);
  assert.equal(requests, 2, 'Retry makes one new catalog request');
  assert.deepEqual(retry.errors, []);
  await retry.context.close();
  passed('Routed catalog error is readable and Try again recovers');

  const empty = await newPage({ width: 390, height: 1000 });
  let emptyRequests = 0;
  await empty.context.route('**/api/projects', route => {
    emptyRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: emptyRequests === 1 ? [] : catalog }) });
  });
  await empty.page.goto(origin);
  await empty.page.getByRole('heading', { name: 'Your universe is waiting.', exact: true }).waitFor();
  await noOverflow(empty.page, 'Empty catalog');
  await empty.page.locator('.catalog-empty').scrollIntoViewIfNeeded();
  await capture(empty.page, 'state-empty.png');
  await empty.page.locator('.catalog-empty').getByRole('button', { name: 'Check for worlds', exact: true }).click();
  await ready(empty.page);
  assert.equal(emptyRequests, 2, 'Empty catalog retry makes one new request');
  assert.deepEqual(empty.errors, []);
  await empty.context.close();
  passed('Routed empty catalog explains the state and Check for worlds recovers');
}

try {
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ executablePath, headless: true });
  await verifyBrand();
  await verifyLoadingAndRetry();
  await writeFile(path.join(screenshots, 'brand-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Brand smoke passed. Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
