import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';
import catalog from '../server/catalog.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const output = path.resolve(process.env.FOUNDRY_OUTPUT_DIR || path.join(tmpdir(), 'turbo-universe', 'interface-foundry-integration'));
const sourceCommit = '56ca9eec9a12136e78ab8b44aaf24947c0fe634a';
const workflowNames = ['direction', 'audit', 'reference', 'reconstruct', 'verify'];
const report = { sourceCommit, startedAt: new Date().toISOString(), output, checks: [], browserErrors: [], networkErrors: [], screenshots: [] };
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(dist));
// A miss inside this independently built app must never become the hub's HTML.
app.use('/interface-foundry', (_request, response) => response.status(404).type('text').send('Not found'));
app.get('/{*path}', (_request, response) => response.sendFile(path.join(dist, 'index.html')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(edge) ? edge : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;

function passed(message, details) {
  report.checks.push({ message, ...(details === undefined ? {} : { details }) });
  console.log(`PASS ${message}`);
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function crc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

async function filesBelow(directory, relative = '') {
  const result = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const filename = path.posix.join(relative, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Built asset is not a symlink: ${filename}`);
    if (entry.isDirectory()) result.push(...await filesBelow(directory, filename));
    else if (entry.isFile()) result.push(filename);
  }
  return result.sort();
}

// Read the downloaded ZIP in memory; no source archive is written into evidence.
function readZip(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  assert.ok(end >= 0, 'Downloaded toolkit has a ZIP central directory');
  assert.equal(bytes.readUInt16LE(end + 4), 0, 'Single-disk ZIP');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'Valid ZIP central record');
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const originalSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.ok(name.startsWith('interface-foundry/') && !name.includes('\\') && !name.split('/').some(part => part === '..' || part === ''), `Safe standalone source entry: ${name}`);
    assert.equal(entries.has(name), false, `No duplicate ZIP entry: ${name}`);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50, 'Valid ZIP local record');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : assert.fail(`Unsupported ZIP compression ${method}`);
    assert.equal(content.length, originalSize, `Complete ZIP content: ${name}`);
    assert.equal(crc32(content), bytes.readUInt32LE(offset + 16), `ZIP checksum matches: ${name}`);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(offset, bytes.readUInt32LE(end + 16) + bytes.readUInt32LE(end + 12), 'ZIP central directory is complete');
  return entries;
}

async function downloadBytes(download) {
  assert.equal(await download.failure(), null, 'Browser download completed');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function watch(page) {
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.browserErrors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.networkErrors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => {
    // Chromium reports normal download handoff as an aborted navigation.
    if (request.failure()?.errorText === 'net::ERR_ABORTED' && /(?:\.zip$|^blob:)/.test(request.url())) return;
    report.networkErrors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
}

async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(size.content <= size.viewport + 1, `${label}: ${size.content}px content fits ${size.viewport}px viewport`);
}

async function assertDialogFits(page, label) {
  const size = await page.locator('#skill-dialog').evaluate(dialog => {
    const bounds = dialog.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, client: dialog.clientWidth, content: dialog.scrollWidth, viewport: innerWidth };
  });
  assert.ok(size.left >= -1 && size.right <= size.viewport + 1 && size.content <= size.client + 1, `${label}: skill dialog fits its viewport`);
  await noOverflow(page, label);
}

async function tabTo(page, locator, label, limit = 60) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(element => element === document.activeElement)) {
      const focus = await locator.evaluate(element => ({ visible: element.matches(':focus-visible'), outline: getComputedStyle(element).outlineStyle, width: Number.parseFloat(getComputedStyle(element).outlineWidth) }));
      assert.ok(focus.visible && focus.outline !== 'none' && focus.width >= 1, `${label} has visible keyboard focus`);
      return;
    }
  }
  assert.fail(`${label} is reachable by keyboard`);
}

async function readyHub(page) {
  await page.locator('.project-grid').getByRole('button', { name: 'View Interface Foundry', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function verifyStatic(context) {
  const entry = catalog.find(project => project.id === 'interface-foundry');
  assert.ok(entry, 'Stable Interface Foundry catalog ID');
  assert.equal(entry.title, 'Interface Foundry');
  assert.equal(entry.type, 'app');
  assert.equal(entry.category, 'Design');
  assert.equal(new URL(entry.url, origin).pathname, '/interface-foundry/');
  assert.ok([origin, 'https://turbouniverse.vercel.app'].includes(new URL(entry.url, origin).origin), 'Catalog points at the hub mount');
  passed('Interface Foundry has its stable local app catalog entry');

  const canonical = await context.request.get(`${origin}/interface-foundry`, { maxRedirects: 0 });
  assert.ok([301, 302, 307, 308].includes(canonical.status()), 'URL without trailing slash redirects');
  assert.equal(new URL(canonical.headers().location, origin).pathname, '/interface-foundry/');
  for (const missing of ['missing', 'assets/missing.js', 'data/missing.json']) {
    const response = await context.request.get(`${origin}/interface-foundry/${missing}`);
    assert.equal(response.status(), 404, `Missing Foundry path returns 404: ${missing}`);
    assert.doesNotMatch(await response.text(), /<title>TurboUniverse/);
  }
  const foundryFiles = await filesBelow(path.join(dist, 'interface-foundry'));
  for (const filename of ['index.html', 'assets/app.js', 'assets/styles.css', 'data/skills.json', 'downloads/interface-foundry-toolkit.zip', 'LICENSE.txt', 'provenance.json']) assert.ok(foundryFiles.includes(filename), `Complete built app includes ${filename}`);
  for (const filename of foundryFiles) {
    const response = await context.request.get(`${origin}/interface-foundry/${filename}`);
    assert.equal(response.status(), 200, `Built asset is served: ${filename}`);
    assert.deepEqual(await response.body(), await readFile(path.join(dist, 'interface-foundry', filename)), `Served bytes match built asset: ${filename}`);
  }
  const response = await context.request.get(`${origin}/interface-foundry/data/skills.json`);
  assert.match(response.headers()['content-type'], /application\/json/);
  const skills = await response.json();
  assert.deepEqual(Object.keys(skills).sort(), [...workflowNames].sort());
  for (const name of workflowNames) assert.ok(typeof skills[name] === 'string' && skills[name].length > 200, `Complete skill data for ${name}`);
  const provenance = await (await context.request.get(`${origin}/interface-foundry/provenance.json`)).json();
  assert.equal(provenance.commit, sourceCommit);
  assert.equal(provenance.mountPath, '/interface-foundry/');
  assert.equal(provenance.license, 'MIT');
  for (const file of provenance.files) {
    const bytes = await readFile(path.join(dist, 'interface-foundry', file.path));
    assert.equal(bytes.length, file.bytes, `Provenance byte count matches ${file.path}`);
    assert.equal(sha256(bytes), file.sha256, `Provenance checksum matches ${file.path}`);
  }
  report.provenance = { repository: provenance.repository, commit: provenance.commit, license: provenance.license, adaptations: provenance.adaptations };
  report.staticFiles = foundryFiles;
  passed('Complete static build, all five skill texts, slash canonicalization, and missing-path isolation', { files: foundryFiles.length });
  return skills;
}

async function verifyHub(page, context) {
  await page.goto(origin);
  await readyHub(page);
  const grid = page.locator('.project-grid');
  const search = page.getByRole('searchbox', { name: 'Search projects', exact: true });
  await search.fill('Interface Foundry');
  assert.equal(await grid.locator('.project-card').count(), 1, 'Hub search finds Interface Foundry');
  await page.getByLabel('Category', { exact: true }).selectOption('Design');
  assert.equal(await grid.locator('.project-card').count(), 1, 'Foundry is discoverable in Design');
  await grid.getByRole('button', { name: 'Save Interface Foundry', exact: true }).click();
  await page.reload();
  await readyHub(page);
  await search.fill('Interface Foundry');
  await page.getByRole('group', { name: 'Filter projects', exact: true }).getByRole('button', { name: /^Saved/ }).click();
  await grid.getByRole('button', { name: 'Unsave Interface Foundry', exact: true }).waitFor();
  assert.equal(await grid.locator('.project-card').count(), 1, 'Saved Foundry returns after reload');
  await grid.getByRole('button', { name: 'View Interface Foundry', exact: true }).click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('heading', { name: 'Interface Foundry', exact: true }).waitFor();
  assert.equal(new URL(await detail.getByRole('link', { name: 'Explore app', exact: true }).getAttribute('href'), origin).pathname, '/interface-foundry/');
  await page.keyboard.press('Escape');
  const nav = page.getByRole('link', { name: 'Open Interface Foundry', exact: true });
  assert.equal(new URL(await nav.getAttribute('href'), origin).pathname, '/interface-foundry/');
  let foundry = page;
  if (await nav.getAttribute('target') === '_blank') {
    [foundry] = await Promise.all([context.waitForEvent('page'), nav.click()]);
    watch(foundry);
  } else await nav.click();
  await foundry.getByRole('heading', { name: 'Give your next interface a point of view.', exact: true }).waitFor();
  assert.equal(new URL(foundry.url()).pathname, '/interface-foundry/');
  assert.equal(await foundry.locator('base').getAttribute('href'), '/interface-foundry/');
  passed('Hub navigation, catalog search and Design filtering, details, and save/reload lead to Foundry');
  return foundry;
}

async function verifyWorkflows(page, context, skills) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const dialog = page.locator('#skill-dialog');
  report.skillDownloads = [];
  for (const name of workflowNames) {
    const tab = page.locator(`#tab-${name}`);
    await tab.click();
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#workflow-panel').getAttribute('aria-labelledby'), `tab-${name}`);
    assert.equal(await page.locator('#skill-name').textContent(), `foundry-${name}`);
    await page.locator('#skill-source').click();
    await dialog.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#copy-skill').disabled);
    assert.equal(await page.locator('#skill-dialog-title').textContent(), `foundry-${name}`);
    assert.equal(await page.locator('#skill-content').textContent(), skills[name], `Complete ${name} skill is readable`);
    await page.locator('#copy-skill').click();
    await page.waitForFunction(() => document.querySelector('#skill-feedback').textContent.startsWith('Skill copied.'));
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // The Windows clipboard represents text line endings as CRLF.
    assert.equal(copied.replaceAll('\r\n', '\n'), skills[name].replaceAll('\r\n', '\n'), `Complete ${name} skill is copied`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-skill').click()]);
    assert.equal(download.suggestedFilename(), 'SKILL.md');
    const bytes = await downloadBytes(download);
    assert.equal(bytes.toString('utf8'), skills[name], `Complete ${name} skill is downloaded`);
    report.skillDownloads.push({ name: `foundry-${name}`, bytes: bytes.length, sha256: sha256(bytes) });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#skill-source').evaluate(element => element === document.activeElement), true, 'Dialog returns focus to its trigger');
  }
  passed('All five workflow tabs read, copy, and download their complete original skill text');

  await page.locator('#tab-direction').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#tab-audit').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#tab-audit').evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('End');
  assert.equal(await page.locator('#tab-verify').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#tab-direction').getAttribute('aria-selected'), 'true');
  await tabTo(page, page.locator('#skill-source'), 'Read complete skill');
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#copy-skill').disabled);
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  await tabTo(page, page.locator('#copy-skill'), 'Copy skill');
  report.dialogFocus = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const focus = await dialog.evaluate(element => ({ inside: element.contains(document.activeElement), tag: document.activeElement.tagName, id: document.activeElement.id, pageFocused: document.hasFocus(), modal: element.matches(':modal') }));
    report.dialogFocus.push(focus);
    assert.ok(focus.inside || (focus.tag === 'BODY' && !focus.pageFocused && focus.modal), `Modal prevents focus reaching background page controls: ${JSON.stringify(focus)}`);
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#skill-source').evaluate(element => element === document.activeElement), true);
  passed('Workflow arrow/Home/End keys, visible Tab focus, modal focus containment, Escape, and focus return');
}

async function verifyArchive(page, skills) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-toolkit').click()]);
  assert.equal(download.suggestedFilename(), 'interface-foundry-toolkit.zip');
  const bytes = await downloadBytes(download);
  const entries = readZip(bytes);
  const names = [...entries.keys()];
  const get = name => {
    const entry = entries.get(`interface-foundry/${name}`);
    assert.ok(entry, `Standalone source ZIP includes ${name}`);
    return entry;
  };
  for (const filename of ['LICENSE', 'README.md', 'package.json', 'package-lock.json', 'index.html', 'assets/app.js', 'assets/styles.css', 'bin/foundry.mjs', 'lib/cli.mjs', 'scripts/build.mjs', 'scripts/archive.mjs', 'scripts/serve.mjs', 'examples/README.md', 'test/build.test.mjs', 'test/cli.test.mjs', 'vercel.json', 'netlify.toml']) get(filename);
  assert.match(get('LICENSE').toString(), /MIT License/);
  const sourcePackage = JSON.parse(get('package.json').toString());
  assert.equal(sourcePackage.name, 'interface-foundry');
  assert.equal(sourcePackage.license, 'MIT');
  assert.equal(sourcePackage.scripts.build, 'node scripts/build.mjs');
  assert.deepEqual(get('index.html'), await readFile(path.join(root, 'vendor', 'interface-foundry', 'index.html')), 'Source ZIP preserves original upstream HTML before hub base/footer adaptations');
  for (const filename of ['assets/app.js', 'assets/styles.css']) assert.deepEqual(get(filename), await readFile(path.join(dist, 'interface-foundry', filename)), `Source ZIP and live site have the same ${filename}`);
  for (const name of workflowNames) {
    assert.equal(get(`skills/foundry-${name}/SKILL.md`).toString('utf8'), skills[name]);
    assert.ok(names.some(filename => filename.startsWith(`interface-foundry/skills/foundry-${name}/templates/`)), `Supporting template for ${name}`);
  }
  for (const name of names) {
    assert.equal(name.split('/').some(part => ['.openai', '.git', 'node_modules', 'dist', 'coverage'].includes(part)), false, `No internal/build directory in ZIP: ${name}`);
    assert.doesNotMatch(path.posix.basename(name), /(?:^|[._-])(?:env|secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[._-]|$)|\.(?:pem|key|p12|pfx|keystore)$/i, `No credential-like file in ZIP: ${name}`);
  }
  report.toolkit = { filename: download.suggestedFilename(), bytes: bytes.length, sha256: sha256(bytes), files: names };
  passed('Actual browser toolkit download is a complete standalone MIT source project with five templates, CLI, examples, build tools, and tests; internal and credential files are excluded', { bytes: bytes.length, files: names.length });
}

async function verifyLabAndResponsive(page) {
  for (const name of ['studio', 'terminal', 'editorial']) {
    await page.locator(`#direction-${name}`).click();
    assert.equal(await page.locator('#design-preview').getAttribute('data-theme'), name);
    assert.equal(await page.locator(`#direction-${name}`).getAttribute('aria-selected'), 'true');
  }
  await page.locator('#direction-editorial').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#design-preview').getAttribute('data-theme'), 'studio');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#design-preview').getAttribute('data-theme'), 'terminal');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#design-preview').getAttribute('data-theme'), 'editorial');
  assert.equal(await page.locator('.note-card').count(), 3);
  await page.getByRole('button', { name: 'Decisions', exact: true }).click();
  assert.equal(await page.locator('.note-card:visible').count(), 1);
  await page.locator('#new-note').click();
  assert.equal(await page.locator('.note-card:visible').count(), 4);
  assert.equal(await page.locator('#entry-count').textContent(), '4 entries');
  await page.getByRole('heading', { name: 'A new idea. No. 4', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  assert.equal(await page.locator('.note-card:visible').count(), 3);
  await page.reload();
  await page.locator('#new-note').waitFor();
  assert.equal(await page.locator('.note-card').count(), 3, 'Browser demo notes reset on reload as disclosed');
  assert.equal(await page.locator('#entry-count').textContent(), '3 entries');
  passed('Editorial/Studio/Terminal controls and keyboard navigation, note filters, New note, and disclosed reset-on-reload behavior');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(page, '1440px Foundry');
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push({ file: 'desktop.png', viewport: { width: 1440, height: 1000 } });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page, `${width}px Foundry`);
    for (const name of ['direction', 'audit', 'reference', 'reconstruct', 'verify']) {
      await page.locator(`#tab-${name}`).click();
      await noOverflow(page, `${width}px ${name} workflow`);
    }
    await page.locator('#skill-source').click();
    await page.locator('#skill-dialog').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#copy-skill').disabled);
    await assertDialogFits(page, `${width}px`);
    await page.keyboard.press('Escape');
    await page.locator('#skill-dialog').waitFor({ state: 'hidden' });
    for (const direction of ['editorial', 'studio', 'terminal']) {
      await page.locator(`#direction-${direction}`).click();
      await noOverflow(page, `${width}px ${direction} lab`);
    }
    if (width === 390) {
      await page.locator('#tab-direction').click();
      await page.locator('#direction-editorial').click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true, animations: 'disabled' });
      report.screenshots.push({ file: 'mobile.png', viewport: { width, height: 844 } });
    }
    passed(`${width}px complete Foundry page, five workflow panels, skill dialog, and three lab themes fit without horizontal overflow`);
  }
}

async function verifyHubHeader(page) {
  report.headerLayouts = [];
  const toggle = page.getByRole('button', { name: 'Toggle navigation', exact: true });
  for (const width of [320, 390, 768, 801, 820, 900, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const mobile = await toggle.isVisible();
    if (mobile) await toggle.click();
    const layout = await page.locator('.site-header').evaluate(header => {
      const box = element => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height, client: element.clientWidth, scroll: element.scrollWidth };
      };
      return { header: box(header), brand: box(header.querySelector('.brand')), nav: box(header.querySelector('.main-nav')), actions: box(header.querySelector('.header-actions')), items: [...header.querySelectorAll('.main-nav > button,.main-nav > a')].map(element => ({ label: element.textContent.trim(), ...box(element) })) };
    });
    report.headerLayouts.push({ width, mobile, ...layout });
    await noOverflow(page, `${width}px hub header`);
    assert.equal(layout.items.length, 5, `${width}px header includes all five navigation items`);
    assert.ok(layout.nav.left >= -1 && layout.nav.right <= width + 1, `${width}px navigation stays within viewport`);
    if (mobile) assert.ok(Math.min(...layout.items.map(item => item.top)) >= Math.max(layout.brand.bottom, layout.actions.bottom) + 3, `${width}px menu controls do not overlap the brand or menu toggle`);
    else {
      assert.ok(layout.nav.left >= layout.brand.right + 3, `${width}px desktop navigation does not collide with the brand: ${JSON.stringify(layout)}`);
      if (layout.actions.width > 1) assert.ok(layout.nav.right + 3 <= layout.actions.left, `${width}px desktop navigation does not collide with header actions`);
    }
    for (let index = 0; index < layout.items.length; index += 1) {
      const item = layout.items[index];
      assert.ok(item.width > 0 && item.height > 0 && item.left >= -1 && item.right <= width + 1, `${width}px ${item.label} is visible within viewport`);
      assert.ok(item.scroll <= item.client + 1, `${width}px ${item.label} text fits its control`);
      for (const other of layout.items.slice(index + 1)) assert.ok(Math.min(item.right, other.right) - Math.max(item.left, other.left) <= 1 || Math.min(item.bottom, other.bottom) - Math.max(item.top, other.top) <= 1, `${width}px ${item.label} and ${other.label} do not overlap`);
    }
    if (mobile) {
      const [foundry] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name: 'Open Interface Foundry', exact: true }).click()]);
      watch(foundry);
      await foundry.getByRole('heading', { name: 'Give your next interface a point of view.', exact: true }).waitFor();
      await foundry.close();
      await toggle.click();
    }
  }
  passed('Hub header and all five navigation controls fit without clipping/collision at 320, 390, 768, 801, 820, 900, 1024, and 1280px; mobile Foundry navigation opens');
}

async function verifyServiceWorker() {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'allow', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const diagnostics = [];
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  try {
    await page.goto(origin);
    await readyHub(page);
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).some(registration => registration.active), undefined, { timeout: 20000 }).catch(async error => {
      report.serviceWorkerDiagnostics = { errors: diagnostics, registrations: await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => ({ scope: registration.scope, installing: registration.installing?.state, waiting: registration.waiting?.state, active: registration.active?.state }))) };
      throw error;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 20000 });
    // The initial catalog request can precede first-time worker activation. Warm
    // the normal controlled hub visit before testing its existing offline data.
    await page.reload();
    await readyHub(page);
    await page.waitForFunction(async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('turbo-universe-projects-') && await (await caches.open(name)).match('/api/projects')) return true;
      }
      return false;
    }, undefined, { timeout: 20000 });
    await page.goto(`${origin}/interface-foundry/`);
    await page.getByRole('heading', { name: 'Give your next interface a point of view.', exact: true }).waitFor();
    const cache = await page.evaluate(async () => {
      const result = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('turbo-universe-')) continue;
        const store = await caches.open(name);
        result.push({ name, urls: (await store.keys()).map(request => new URL(request.url).pathname), root: await (await store.match('/'))?.text() });
      }
      return result;
    });
    const shell = cache.find(entry => entry.name.startsWith('turbo-universe-shell-'));
    assert.ok(shell?.root, 'A real active hub worker has cached its app shell');
    assert.match(shell.root, /<title>TurboUniverse/);
    assert.doesNotMatch(shell.root, /<title>Interface Foundry/);
    assert.equal(cache.some(entry => entry.urls.some(url => url === '/interface-foundry' || url.startsWith('/interface-foundry/'))), false, 'Hub worker bypasses all Foundry content');
    await context.setOffline(true);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'TurboUniverse', exact: true }).waitFor();
    await readyHub(page);
    assert.match(await page.title(), /TurboUniverse/);
    assert.deepEqual(errors, []);
    report.serviceWorker = { controlled: true, shellCache: shell.name, rootRemainsHub: true, foundryCachedByHub: false, offlineHubCatalogLoads: true };
    passed('Real active service worker bypasses Foundry and preserves the TurboUniverse shell and catalog for offline return');
  } finally {
    await context.setOffline(false);
    await context.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  watch(page);
  const skills = await verifyStatic(context);
  const foundry = await verifyHub(page, context);
  await verifyWorkflows(foundry, context, skills);
  await verifyArchive(foundry, skills);
  await verifyLabAndResponsive(foundry);
  await foundry.getByRole('link', { name: 'Back to TurboUniverse', exact: true }).click();
  await readyHub(foundry);
  await foundry.locator('.project-grid').getByRole('button', { name: 'Unsave Interface Foundry', exact: true }).waitFor();
  passed('Foundry footer returns to TurboUniverse with the saved app retained');
  await verifyHubHeader(foundry);
  await foundry.waitForLoadState('networkidle');
  assert.deepEqual(report.browserErrors, [], 'No browser console or runtime errors');
  assert.deepEqual(report.networkErrors, [], 'No failed page requests or HTTP errors');
  passed('Foundry and hub integration have no browser console/runtime errors or failed page requests');
  await context.close();
  await verifyServiceWorker();
  report.status = 'passed';
  console.log(`Interface Foundry smoke passed. Evidence: ${output}`);
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack };
  throw error;
} finally {
  report.completedAt = new Date().toISOString();
  try {
    if (existsSync(output)) await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
