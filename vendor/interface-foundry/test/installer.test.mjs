import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installSkills, SKILLS } from '../lib/cli.mjs';
import { repository, temporaryDirectory, snapshot } from './helpers.mjs';

test('install both agents with complete skills and templates, preserving unrelated files', async t => {
  const project = await temporaryDirectory(t);
  await writeFile(path.join(project, 'project.txt'), 'existing app');
  const result = await installSkills(project, 'both');
  assert.equal(result.skills, 5);
  assert.equal(result.unchanged, 0);
  assert.ok(result.written >= 20, 'five skills plus their supporting templates for both agents');
  for (const agentDirectory of ['.claude', '.agents']) {
    for (const skill of SKILLS) {
      const source = await snapshot(path.join(repository, 'skills', skill));
      const installed = await snapshot(path.join(project, agentDirectory, 'skills', skill));
      assert.deepEqual(installed, source);
      assert.match(installed['SKILL.md'], /^---\nname: /);
      assert.ok(Object.keys(installed).some(name => name.startsWith('templates/')));
    }
  }
  assert.equal(await readFile(path.join(project, 'project.txt'), 'utf8'), 'existing app');
  const before = await snapshot(project);
  const repeat = await installSkills(project, 'both');
  assert.equal(repeat.written, 0);
  assert.equal(repeat.unchanged, result.written);
  assert.deepEqual(await snapshot(project), before);
});

test('conflicting customized skill prevents all planned writes across both agents', async t => {
  const project = await temporaryDirectory(t);
  const customized = path.join(project, '.agents', 'skills', 'foundry-verify');
  await mkdir(customized, { recursive: true });
  await writeFile(path.join(customized, 'SKILL.md'), 'my customized skill');
  const before = await snapshot(project);
  await assert.rejects(installSkills(project, 'both'), /Existing file differs/);
  assert.deepEqual(await snapshot(project), before);
  assert.deepEqual(await readdir(project), ['.agents']);
});

test('installer refuses symlinked agent directories without touching their targets', async t => {
  const project = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  await writeFile(path.join(outside, 'keep.txt'), 'untouched');
  await symlink(outside, path.join(project, '.claude'));
  await assert.rejects(installSkills(project), /symlink/i);
  assert.deepEqual(await snapshot(outside), { 'keep.txt': 'untouched' });
});

test('installer refuses symlinked individual files and invalid project paths', async t => {
  const project = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  const destination = path.join(project, '.claude', 'skills', 'foundry-direction');
  await mkdir(destination, { recursive: true });
  const outsideFile = path.join(outside, 'keep.md');
  await writeFile(outsideFile, 'do not overwrite');
  await symlink(outsideFile, path.join(destination, 'SKILL.md'));
  await assert.rejects(installSkills(project), /symlink/i);
  assert.equal(await readFile(outsideFile, 'utf8'), 'do not overwrite');
  await assert.rejects(installSkills(outsideFile), /existing directory/);
  await assert.rejects(installSkills(project, 'unknown'), /Agent must be/);
  await assert.rejects(installSkills(project, 'constructor'), /Agent must be/);
  await assert.rejects(installSkills(project, '__proto__'), /Agent must be/);
});
