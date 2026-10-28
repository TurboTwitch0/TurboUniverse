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
const output = path.resolve(process.env.BRAND_OUTPUT_DIR || path.join(root, '../../outputs/turbouniverse-brand-kit'));
const report = { testedAt: new Date().toISOString(), output, checks: [], screenshots: [], failures: [] };
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(path.join(root, 'dist')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;

function passed(message, details) {
  report.checks.push(details ? { message, ...details } : { message });
  console.log(`PASS ${message}`);
}

async function newPage(viewport, options = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  const errors = [];
  const modelRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route(/https:\/\/(?:[^/]+\.)?(?:huggingface\.co|hf\.co|mlc\.ai)\//, route => {
    modelRequests.push(route.request().url());
    return route.abort();
  });
  return { page, context, errors, modelRequests };
}

async function ready(page) {
  await page.locator('.project-grid').getByRole('button', { name: 'View TurboChat', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, `${label}: ${dimensions.content}px content exceeds ${dimensions.viewport}px viewport`);
}

async function assertVisibleFocus(page, label) {
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

async function tabTo(page, locator, label, limit = 120) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(element => element === document.activeElement)) {
      await assertVisibleFocus(page, label);
      return;
    }
  }
  assert.fail(`Could not reach ${label} with Tab`);
}

async function assertExternalLink(link, url) {
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.ok((await link.getAttribute('rel') || '').split(/\s+/).includes('noopener'));
}

async function clickExposedCard(page, card) {
  await card.scrollIntoViewIfNeeded();
  const exposed = await card.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hits = [];
    for (const xRatio of [0.5, 0.8, 0.9, 0.2, 0.1]) {
      for (const yRatio of [0.5, 0.3, 0.7]) {
        const x = bounds.left + bounds.width * xRatio;
        const y = bounds.top + bounds.height * yRatio;
        const hit = document.elementFromPoint(x, y);
        hits.push(hit?.className?.baseVal ?? hit?.className ?? 'outside viewport');
        if (hit?.closest('.world-stage-card') === element) return { point: { x, y }, hits };
      }
    }
    return { point: null, hits, bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } };
  });
  assert.ok(exposed.point, `A neighboring stage card has an exposed clickable surface: ${JSON.stringify(exposed)}`);
  await page.mouse.click(exposed.point.x, exposed.point.y);
}

async function capture(page, filename, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.world-stage img').evaluateAll(images => Promise.all(images.filter(image => image.getClientRects().length > 0).map(image => image.decode().catch(() => {}))));
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled', ...options });
  report.screenshots.push(filename);
}

const stageOf = page => page.locator('.world-stage');
const activeCardOf = page => stageOf(page).locator('.world-stage-card[data-active="true"]');
const activeTitle = page => stageOf(page).locator('.world-stage-active-copy h3').innerText();

async function chooseWorld(page, title) {
  await stageOf(page).getByRole('button', { name: `Show ${title} in orbital stage`, exact: true }).click();
  await assertWorld(page, title);
}

async function assertWorld(page, title) {
  await stageOf(page).getByRole('button', { name: `View ${title} in orbital stage`, exact: true }).waitFor();
  assert.equal(await activeTitle(page), title);
  assert.equal(await activeCardOf(page).getAttribute('aria-current'), 'true');
  assert.equal(await stageOf(page).getByRole('button', { name: `Show ${title} in orbital stage`, exact: true }).getAttribute('aria-current'), 'true');
  assert.match(await stageOf(page).getByRole('status', { name: 'Focused world', exact: true }).innerText(), new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, world \\d+ of \\d+\\.$`));
}

async function assertStageGeometry(page, label) {
  await assertNoOverflow(page, label);
  const active = await activeCardOf(page).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const viewport = element.closest('.world-stage-viewport').getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, viewportLeft: viewport.left, viewportRight: viewport.right, viewportTop: viewport.top, viewportBottom: viewport.bottom };
  });
  assert.ok(active.left >= active.viewportLeft && active.right <= active.viewportRight && active.top >= active.viewportTop && active.bottom <= active.viewportBottom, `${label}: active card stays fully visible`);
  const clips = await stageOf(page).locator('.world-stage-active-copy, .world-stage-actions, .world-stage-footer').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className));
  assert.deepEqual(clips, [], `${label}: stage text and actions have no horizontal clipping`);
}

async function assertReducedMotion(page) {
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
  const motion = await activeCardOf(page).evaluate(element => ({
    transition: getComputedStyle(element).transitionDuration,
    running: document.getAnimations().filter(animation => animation.playState === 'running').length,
  }));
  assert.ok(motion.transition.split(',').every(value => Number.parseFloat(value) === 0), 'Reduced motion removes stage card transitions');
  assert.equal(motion.running, 0, 'Reduced motion leaves no running page animations');
}

async function assertStageActions(page, title) {
  const stage = stageOf(page);
  await chooseWorld(page, title);
  const project = catalog.find(world => world.title === title);
  assert.ok(project, `${title} exists in the canonical catalog`);
  const launch = stage.getByRole('link', { name: `Launch ${title} from orbital stage`, exact: true });
  await assertExternalLink(launch, project.url);
  // Exercise the real new-tab action against a local response at its canonical URL.
  await page.context().route(`${project.url}**`, route => route.fulfill({ contentType: 'text/html', body: '<title>Orbital stage launch check</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await launch.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), project.url);
  assert.equal(await popup.evaluate(() => window.opener), null);
  await popup.close();
  const save = stage.getByRole('button', { name: `Save ${title} from orbital stage`, exact: true });
  await save.click();
  assert.equal(await stage.getByRole('button', { name: `Unsave ${title} from orbital stage`, exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.project-grid').getByRole('button', { name: `Unsave ${title}`, exact: true }).waitFor();
  await page.reload();
  await ready(page);
  await chooseWorld(page, title);
  assert.equal(await stage.getByRole('button', { name: `Unsave ${title} from orbital stage`, exact: true }).getAttribute('aria-pressed'), 'true');
  await stage.getByRole('button', { name: 'View details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.waitFor();
  await assertNoOverflow(page, `${title} details`);
  await assertExternalLink(dialog.locator('.detail-actions > a.primary-button'), project.url);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await stage.getByRole('button', { name: `Explore ${project.category} from orbital stage`, exact: true }).click();
  assert.equal(await page.getByLabel('Category', { exact: true }).inputValue(), project.category);
  assert.equal(await page.locator('.project-grid .project-card').count(), catalog.filter(world => world.category === project.category).length);
  await page.getByRole('button', { name: 'The universe', exact: true }).click();
  await ready(page);
  passed('Stage launch, save and reload persistence, details, and category use actual catalog destinations', { title });
}

async function verifyCatalog(page) {
  assert.equal(new Set(catalog.map(world => world.id)).size, catalog.length, 'Canonical catalog has no duplicate IDs');
  assert.equal(new Set(catalog.map(world => world.url.replace(/\/$/, ''))).size, catalog.length, 'Canonical catalog has no duplicate destination URLs');
  const studies = catalog.filter(world => /^(?:orbit\s?study|study\s?orbit|turbo\s?study)$/i.test(world.title));
  assert.equal(studies.length, 1, 'Study aliases resolve to one canonical project');
  assert.equal(studies[0].title, 'Orbit Study');
  assert.equal(studies[0].url, 'https://studyorbitv1.vercel.app/');
  assert.equal(studies[0].status, undefined, 'Orbit Study is live in the catalog');
  const evovo = catalog.filter(world => /^EVOVO$/i.test(world.title));
  assert.equal(evovo.length, 1, 'EVOVO appears once');
  assert.match(evovo[0].url, /^https:\/\//);
  assert.equal(evovo[0].status, undefined);
  assert.equal(await page.locator('.project-grid .project-card').count(), catalog.length);
  for (const project of [studies[0], evovo[0]]) {
    await assertExternalLink(page.locator('.project-grid').getByRole('link', { name: `Launch ${project.title}`, exact: true }), project.url);
  }
  const watch = catalog.find(world => world.title === 'TurboWatch');
  assert.ok(watch);
  if (/github\.com\//.test(watch.url)) {
    assert.equal(watch.status, 'setup-pending', 'TurboWatch source destination is honestly marked pending');
    const source = page.locator('.project-grid').getByRole('link', { name: 'View source for TurboWatch', exact: true });
    await assertExternalLink(source, watch.url);
    assert.match(await source.locator('..').innerText(), /SETUP PENDING/);
    assert.equal(await stageOf(page).getByRole('button', { name: 'Show TurboWatch in orbital stage', exact: true }).count(), 0, 'Pending source-only project is excluded from live stage');
  }
  passed('Canonical Orbit Study live link, EVOVO link, duplicate removal, and honest pending TurboWatch status');
}

async function verifyStage() {
  const { page, context, errors, modelRequests } = await newPage({ width: 1440, height: 2400 });
  await page.goto(origin);
  await ready(page);
  const stage = stageOf(page);
  await stage.waitFor();
  assert.equal(await stage.getAttribute('aria-roledescription'), 'carousel');
  const titles = await stage.locator('.stage-dots button').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label').replace(/^Show /, '').replace(/ in orbital stage$/, '')));
  assert.ok(titles.length >= 4, 'Stage has actual featured projects');
  assert.equal(new Set(titles).size, titles.length, 'Stage has no duplicate worlds');
  await assertWorld(page, titles[0]);
  await assertStageGeometry(page, 'Desktop 1440px');
  await assertReducedMotion(page);
  await verifyCatalog(page);
  await capture(page, 'product-desktop.png');
  await stage.screenshot({ path: path.join(output, 'showcase-desktop.png'), animations: 'disabled' });
  report.screenshots.push('showcase-desktop.png');

  await stage.getByRole('button', { name: 'Previous world', exact: true }).click();
  await assertWorld(page, titles.at(-1));
  await stage.getByRole('button', { name: 'Next world', exact: true }).click();
  await assertWorld(page, titles[0]);
  const neighbor = stage.locator('.world-stage-card[data-offset="1"]');
  const nextTitle = (await neighbor.getAttribute('aria-label')).replace(/^Focus /, '').replace(/ in orbital stage$/, '');
  await clickExposedCard(page, neighbor);
  await assertWorld(page, nextTitle);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Picking a neighboring card focuses its world before details');
  passed('Desktop previous/next wrap and neighboring cards select the corresponding world');

  await chooseWorld(page, titles[0]);
  await stage.locator('h2').click();
  await tabTo(page, activeCardOf(page), 'Active orbital card');
  await page.keyboard.press('ArrowRight');
  await assertWorld(page, titles[1]);
  assert.equal(await activeCardOf(page).evaluate(element => element === document.activeElement), true, 'Arrow navigation keeps focus on active card');
  await assertVisibleFocus(page, 'Arrow-selected orbital card');
  await page.keyboard.press('End');
  await assertWorld(page, titles.at(-1));
  await page.keyboard.press('Home');
  await assertWorld(page, titles[0]);
  await page.keyboard.press('ArrowLeft');
  await assertWorld(page, titles.at(-1));
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: titles.at(-1), exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await tabTo(page, stage.getByRole('button', { name: 'Previous world', exact: true }), 'Previous world control');
  await page.keyboard.press('Tab');
  assert.equal(await stage.getByRole('button', { name: 'Next world', exact: true }).evaluate(element => element === document.activeElement), true);
  await assertVisibleFocus(page, 'Next world control');
  await page.keyboard.press('Enter');
  await assertWorld(page, titles[0]);
  passed('Tab, Enter, ArrowLeft/Right, Home/End, active-card focus retention, and visible focus outlines');

  await assertStageActions(page, titles[0]);
  await chooseWorld(page, 'Orbit Study');
  await assertExternalLink(stage.getByRole('link', { name: 'Launch Orbit Study from orbital stage', exact: true }), 'https://studyorbitv1.vercel.app/');
  const evovo = catalog.find(world => /^EVOVO$/i.test(world.title));
  await chooseWorld(page, evovo.title);
  await assertExternalLink(stage.getByRole('link', { name: `Launch ${evovo.title} from orbital stage`, exact: true }), evovo.url);
  passed('Stage includes canonical live Orbit Study and EVOVO');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    await ready(page);
    await chooseWorld(page, titles[0]);
    await assertStageGeometry(page, `${width}px stage`);
    await assertReducedMotion(page);
    await stage.locator('h2').click();
    await tabTo(page, activeCardOf(page), `${width}px active orbital card`);
    await page.keyboard.press('ArrowRight');
    await assertWorld(page, titles[1]);
    await assertVisibleFocus(page, `${width}px keyboard-selected orbital card`);
    await stage.getByRole('button', { name: 'Next world', exact: true }).click();
    await assertWorld(page, titles[2]);
    await stage.getByRole('button', { name: 'Previous world', exact: true }).click();
    await assertWorld(page, titles[1]);
    if (width === 390) {
      await chooseWorld(page, titles[0]);
      await page.setViewportSize({ width, height: 2700 });
      await page.evaluate(() => scrollTo(0, 0));
      await capture(page, 'product-mobile.png');
      await stage.screenshot({ path: path.join(output, 'showcase-mobile.png'), animations: 'disabled' });
      report.screenshots.push('showcase-mobile.png');
      await page.setViewportSize({ width, height: 1000 });
    }
    passed(`${width}px layout has no page overflow or clipped active card; keyboard and arrows work`);
  }
  assert.deepEqual(errors, [], 'Desktop and responsive interactions have no runtime errors');
  assert.deepEqual(modelRequests, [], 'No model host is contacted by stage interactions');
  await context.close();

  await verifyLegacyIdentity();
  await verifyTouch(titles);
  await verifyNoAutoplay();
}

async function verifyTouch(titles) {
  for (const width of [390, 320]) {
  const { page, context, errors, modelRequests } = await newPage({ width, height: 844 }, { hasTouch: true, isMobile: true });
  await page.goto(origin);
  await ready(page);
  const viewport = stageOf(page).locator('.world-stage-viewport');
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  const cdp = await context.newCDPSession(page);
  const swipe = async (start, end) => {
    const y = box.y + box.height * 0.45;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe(box.x + box.width * 0.8, box.x + box.width * 0.2);
  await assertWorld(page, titles[1]);
  await swipe(box.x + box.width * 0.2, box.x + box.width * 0.8);
  await assertWorld(page, titles[0]);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Swipe does not also activate a card');
  await assertStageGeometry(page, `${width}px actual touch swipe`);
  assert.deepEqual(errors, []);
  assert.deepEqual(modelRequests, []);
  await context.close();
  passed(`${width}px actual touch events swipe left/right and suppress accidental card activation`);
  }
}

async function verifyLegacyIdentity() {
  const legacyId = '4d14f53c-7186-518f-85c6-63f0752a1614';
  const canonicalId = '082fc48b-9cd7-4ae9-ba7a-18bf1ec83dd7';
  const { page, context, errors, modelRequests } = await newPage({ width: 390, height: 1000 });
  await context.addInitScript(({ legacyId, canonicalId }) => {
    if (localStorage.getItem('orbital-alias-test-initialized')) return;
    localStorage.setItem('turbo-universe-saved-worlds', JSON.stringify([legacyId, canonicalId]));
    localStorage.setItem('turbo-universe-recent-worlds', JSON.stringify([legacyId, canonicalId]));
    localStorage.setItem('orbital-alias-test-initialized', 'true');
  }, { legacyId, canonicalId });
  await page.goto(`${origin}/?world=${legacyId}`);
  await ready(page);
  const dialog = page.getByRole('dialog', { name: 'Orbit Study', exact: true });
  await dialog.waitFor();
  await assertExternalLink(dialog.locator('.detail-actions > a.primary-button'), 'https://studyorbitv1.vercel.app/');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.project-grid').getByRole('button', { name: 'Unsave Orbit Study', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Revisit Orbit Study', exact: true }).count(), 1, 'Legacy and canonical recent IDs deduplicate');
  await page.getByRole('button', { name: 'Revisit Orbit Study', exact: true }).click();
  await dialog.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('world'), canonicalId, 'Revisited project uses its canonical share URL');
  await page.reload();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await chooseWorld(page, 'Orbit Study');
  assert.equal(await stageOf(page).getByRole('button', { name: 'Unsave Orbit Study from orbital stage', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.project-grid').getByRole('button', { name: 'Unsave Orbit Study', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(modelRequests, []);
  await context.close();
  passed('Legacy TurboStudy favorite, recent history, and shared detail URL resolve to one live Orbit Study and survive reload');
}

async function verifyNoAutoplay() {
  const { page, context, errors, modelRequests } = await newPage({ width: 1440, height: 1000 }, { reducedMotion: 'no-preference' });
  await page.goto(origin);
  await ready(page);
  const initial = await activeTitle(page);
  await page.waitForTimeout(5500);
  assert.equal(await activeTitle(page), initial, 'Stage stays on its selected world without user input');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const duration = await activeCardOf(page).evaluate(element => getComputedStyle(element).transitionDuration);
  // The existing global reduced-motion rule permits a 0.01ms transition to settle state.
  assert.ok(duration.split(',').every(value => Number.parseFloat(value) <= 0.001), `Operating system reduced-motion change removes perceptible transitions: ${duration}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(modelRequests, []);
  await context.close();
  passed('Stage has no autoplay after 5.5 seconds and responds to reduced-motion changes');
}

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath, headless: true });
  await verifyStage();
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failures.push({ message: error.message, stack: error.stack });
  throw error;
} finally {
  await writeFile(path.join(output, 'orbital-stage-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
