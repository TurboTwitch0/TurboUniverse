import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createBrief } from '../lib/brief.mjs';
import { cli, temporaryDirectory } from './helpers.mjs';

test('CLI help, version, doctor, and invalid arguments have useful exit behavior', () => {
  assert.match(cli([]).stdout, /Usage:/);
  assert.equal(cli(['help']).status, 0);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  assert.equal(cli(['doctor']).status, 0);
  for (const args of [['unknown'], ['init'], ['brief', '--unknown', 'x'], ['brief', '--name'], ['audit', '--format', 'xml'], ['audit', '--fail-on', 'always']]) {
    const result = cli(args);
    assert.equal(result.status, 1, `${args.join(' ')} must fail`);
    assert.match(result.stderr, /Foundry:/);
    assert.equal(result.stdout, '');
  }
});

test('brief directions produce distinct CSS tokens and preserve the supplied product intent', () => {
  const briefs = ['editorial', 'studio', 'terminal'].map(direction => createBrief({ name: 'Orbit', audience: 'Design teams', goal: 'Send feedback', direction }));
  for (const brief of briefs) {
    assert.match(brief, /# Orbit/);
    assert.match(brief, /Audience: Design teams/);
    assert.match(brief, /Primary task: Send feedback/);
    assert.match(brief, /--color-background: #[0-9a-f]{6}/);
    assert.match(brief, /--font-display:/);
    assert.match(brief, /initial direction/);
  }
  assert.equal(new Set(briefs).size, 3);
  assert.throws(() => createBrief({ direction: 'unknown' }), /Direction must be/);
  assert.throws(() => createBrief({ direction: 'constructor' }), /Direction must be/);
  assert.throws(() => createBrief({ direction: '__proto__' }), /Direction must be/);
});

test('brief CLI writes a new artifact and refuses to overwrite existing work', async t => {
  const project = await temporaryDirectory(t);
  const filename = path.join(project, 'DESIGN.md');
  const first = cli(['brief', '--name', 'Orbit', '--direction', 'terminal', '--out', filename]);
  assert.equal(first.status, 0);
  const before = await readFile(filename, 'utf8');
  assert.match(before, /Direction: Terminal/);
  const second = cli(['brief', '--name', 'Replacement', '--out', filename]);
  assert.equal(second.status, 1);
  assert.equal(await readFile(filename, 'utf8'), before);
});

test('audit CLI emits valid JSON on failure and fail-on controls error versus warning policy', async t => {
  const project = await temporaryDirectory(t);
  const filename = path.join(project, 'component.jsx');
  await writeFile(filename, '<img src="test.png">');
  const failure = cli(['audit', project, '--format', 'json']);
  assert.equal(failure.status, 1);
  const report = JSON.parse(failure.stdout);
  assert.equal(report.summary.errors, 1);
  assert.equal(report.findings[0].file, 'component.jsx');
  assert.equal(failure.stderr, '');
  assert.equal(cli(['audit', project, '--fail-on', 'never']).status, 0);
  await writeFile(filename, '<input type="email">');
  assert.equal(cli(['audit', project]).status, 0);
  assert.equal(cli(['audit', project, '--fail-on', 'warning']).status, 1);
  assert.equal(cli(['audit', filename, '--format', 'json']).status, 0);
});

test('init CLI accepts target paths with spaces and defaults to Claude skills', async t => {
  const temporary = await temporaryDirectory(t);
  const project = path.join(temporary, 'my example app');
  await mkdir(project);
  const installed = cli(['init', project]);
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /5 skills for claude/);
  assert.match(await readFile(path.join(project, '.claude', 'skills', 'foundry-direction', 'SKILL.md'), 'utf8'), /name: foundry-direction/);
});
