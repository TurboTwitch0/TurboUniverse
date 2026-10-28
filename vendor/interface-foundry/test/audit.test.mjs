import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { audit, inspectSource } from '../lib/audit.mjs';
import { temporaryDirectory } from './helpers.mjs';

test('HTML audit reports actionable evidence with original line numbers', () => {
  const source = '<!doctype html>\n<html>\n<head></head>\n<body>\n<img src="portrait.png">\n<button></button>\n<input type="email">\n</body></html>';
  const findings = inspectSource(source, 'page.html');
  const byRule = Object.fromEntries(findings.map(finding => [finding.rule, finding]));
  assert.equal(byRule['document-language'].severity, 'error');
  assert.equal(byRule['document-title'].severity, 'error');
  assert.equal(byRule.viewport.severity, 'warning');
  assert.equal(byRule['image-alt'].line, 5);
  assert.equal(byRule['empty-button'].line, 6);
  assert.equal(byRule['input-label'].line, 7);
  assert.ok(findings.every(finding => finding.file === 'page.html'));
});

test('meaningful attributes, decorative images, and common input label forms pass', () => {
  const source = `<!doctype html>
<html lang="en"><head><title>Contact us</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><img src="flourish.svg" alt=""><img src="team.jpg" alt="Our support team">
<button aria-label="Open navigation"></button><button>Submit request</button>
<label for="email">Email</label><input id="email" type="email">
<label>Search<input type="search"></label><input aria-label="Project name">
<input aria-labelledby="other-label"><input type="hidden"><input type="submit" value="Send">
</body></html>`;
  assert.deepEqual(inspectSource(source, 'contact.html'), []);
  assert.deepEqual(inspectSource('<label htmlFor="email">Email</label><input id="email" />', 'form.tsx'), []);
});

test('comments and inline scripts do not create spurious missing-alt findings', () => {
  const source = `<!-- <img src="comment.jpg"> -->
<script>const example = '<img src="string.jpg">';</script>
<img src="actual.jpg">`;
  const findings = inspectSource(source, 'fragment.html');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'image-alt');
  assert.equal(findings[0].line, 3);
});

test('CSS review distinguishes unguarded motion and removed outlines from documented replacements', () => {
  const findings = inspectSource('.control { transition: transform .2s; outline: none; }', 'styles.css');
  assert.deepEqual(new Set(findings.map(finding => finding.rule)), new Set(['reduced-motion', 'focus-indicator']));
  const accessible = `.control { transition: transform .2s; outline: none; }
.control:focus-visible { outline: 2px solid black; }
@media (prefers-reduced-motion: reduce) { .control { transition: none; } }`;
  assert.deepEqual(inspectSource(accessible, 'styles.css'), []);
});

test('disabled or zero-duration CSS motion does not request a reduced-motion override', () => {
  assert.deepEqual(inspectSource('button { transition: none; animation: none; }', 'styles.css'), []);
  assert.deepEqual(inspectSource('button { transition: 0s; animation: 0s; }', 'styles.css'), []);
});

test('HTML native-tag checks are case-insensitive', () => {
  const findings = inspectSource('<!DOCTYPE HTML><HTML><HEAD></HEAD><BODY><IMG SRC="portrait.png"><BUTTON></BUTTON><INPUT TYPE="email"></BODY></HTML>', 'page.html');
  const rules = new Set(findings.map(finding => finding.rule));
  for (const expected of ['document-language', 'image-alt', 'empty-button', 'input-label']) assert.ok(rules.has(expected), `Expected ${expected}`);
});

test('framework bindings and custom JSX components do not become definite native-element errors', () => {
  assert.deepEqual(inspectSource('<template><img :src="image.url" :alt="image.description"><img v-bind="imageProps"><img v-bind:alt="description"></template>', 'Gallery.vue'), []);
  assert.deepEqual(inspectSource('<Img source="portrait" /><Button /><Input />', 'Gallery.tsx'), []);
  assert.deepEqual(inspectSource('<img {...imageProps} />', 'Gallery.tsx'), []);
});

test('audit ignores generated/vendor/hidden files and never follows symlinks', async t => {
  const project = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  await writeFile(path.join(project, 'component.tsx'), '<button>Save</button>');
  for (const ignored of ['node_modules', '.git', 'dist', '.hidden']) {
    await mkdir(path.join(project, ignored));
    await writeFile(path.join(project, ignored, 'bad.html'), '<img>');
  }
  await writeFile(path.join(outside, 'bad.html'), '<img>');
  await symlink(outside, path.join(project, 'linked-directory'));
  await symlink(path.join(outside, 'bad.html'), path.join(project, 'linked.html'));
  const report = await audit(project);
  assert.equal(report.filesScanned, 1);
  assert.deepEqual(report.findings, []);
  assert.match(report.limitations, /heuristics/);
  assert.ok(report.manualChecks.includes('computed color contrast'));
});

test('empty and oversized-only projects return an explicit no-source warning', async t => {
  const project = await temporaryDirectory(t);
  const empty = await audit(project);
  assert.equal(empty.filesScanned, 0);
  assert.equal(empty.findings[0].rule, 'no-source-files');
  await writeFile(path.join(project, 'large.html'), ' '.repeat(1024 * 1024 + 1));
  const report = await audit(project);
  assert.equal(report.filesScanned, 0);
  assert.equal(report.skipped[0].file, 'large.html');
  assert.equal(report.findings[0].rule, 'no-source-files');
});
