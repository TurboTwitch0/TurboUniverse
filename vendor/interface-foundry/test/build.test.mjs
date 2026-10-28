import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, copyFile, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildProject, SKILL_MAP } from '../scripts/build.mjs';
import { createZip, crc32 } from '../scripts/archive.mjs';
import { checkHtml } from '../scripts/check.mjs';
import { repository, temporaryDirectory } from './helpers.mjs';

async function fixture(t) {
  const root = await temporaryDirectory(t);
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><html lang="en"><head><title>Fixture</title><link rel="stylesheet" href="assets/style.css"></head><body><h1 id="title">Toolkit</h1><a href="#title">Top</a><a href="downloads/interface-foundry-toolkit.zip">Download</a><script src="assets/app.js" defer></script></body></html>');
  await writeFile(path.join(root, 'assets/style.css'), 'body { color: #222; }');
  await writeFile(path.join(root, 'assets/app.js'), 'console.log("fixture");');
  await cp(path.join(repository, 'skills'), path.join(root, 'skills'), { recursive: true });
  for (const directory of ['bin', 'lib', 'scripts', 'test', 'examples', 'docs', '.github/workflows']) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, 'bin/foundry.mjs'), '#!/usr/bin/env node\nconsole.log("Fixture CLI");\n');
  await writeFile(path.join(root, 'lib/fixture.mjs'), 'export const fixture = true;\n');
  await writeFile(path.join(root, '.github/workflows/ci.yml'), 'name: CI\n');
  await writeFile(path.join(root, 'README.md'), '# Interface Foundry\n');
  await writeFile(path.join(root, 'LICENSE'), 'Fixture license');
  await writeFile(path.join(root, 'package.json'), '{"type":"module","bin":{"interface-foundry":"bin/foundry.mjs"}}\n');
  return root;
}

// Independently read both central-directory metadata and the local file records.
// This catches broken ZIP offsets/lengths as well as corrupt compressed data.
function readZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    assert.equal(bytes.readUInt16LE(cursor + 10), 8);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedLength = bytes.readUInt32LE(cursor + 20);
    const originalLength = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    assert.equal(bytes.readUInt32LE(offset + 14), checksum);
    const localNameLength = bytes.readUInt16LE(offset + 26);
    const localExtraLength = bytes.readUInt16LE(offset + 28);
    assert.equal(bytes.subarray(offset + 30, offset + 30 + localNameLength).toString('utf8'), name);
    const start = offset + 30 + localNameLength + localExtraLength;
    const data = inflateRawSync(bytes.subarray(start, start + compressedLength));
    assert.equal(data.length, originalLength);
    assert.equal(crc32(data), checksum);
    assert.ok(!files.has(name), `duplicate ZIP path: ${name}`);
    files.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end);
  return files;
}

test('build emits site assets, exact skill data and a complete deterministic source ZIP', async t => {
  const root = await fixture(t);
  await copyFile(path.join(repository, 'scripts/build.mjs'), path.join(root, 'scripts/build.mjs'));
  await copyFile(path.join(repository, 'scripts/archive.mjs'), path.join(root, 'scripts/archive.mjs'));
  const result = await buildProject(root);
  assert.equal(result.directory, path.join(root, 'dist'));
  assert.equal(result.skills, 5);
  assert.equal(await readFile(path.join(root, 'dist/index.html'), 'utf8'), await readFile(path.join(root, 'index.html'), 'utf8'));
  assert.equal(await readFile(path.join(root, 'dist/assets/app.js'), 'utf8'), await readFile(path.join(root, 'assets/app.js'), 'utf8'));
  const data = JSON.parse(await readFile(path.join(root, 'dist/data/skills.json'), 'utf8'));
  assert.deepEqual(Object.keys(data).sort(), Object.keys(SKILL_MAP).sort());
  for (const [key, name] of Object.entries(SKILL_MAP)) assert.equal(data[key], await readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8'));
  const firstZip = await readFile(path.join(root, 'dist/downloads/interface-foundry-toolkit.zip'));
  const entries = readZip(firstZip);
  for (const name of ['index.html', 'README.md', 'LICENSE', 'package.json', 'bin/foundry.mjs', 'lib/fixture.mjs', 'scripts/build.mjs', 'scripts/archive.mjs', '.github/workflows/ci.yml', 'assets/app.js', 'skills/foundry-direction/templates/DESIGN.md']) assert.ok(entries.has(`interface-foundry/${name}`), `source ZIP lacks ${name}`);
  await writeFile(path.join(root, 'dist/stale.txt'), 'previous output');
  await buildProject(root);
  await assert.rejects(access(path.join(root, 'dist/stale.txt')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(path.join(root, 'dist/downloads/interface-foundry-toolkit.zip')), firstZip);
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.foundry-build-')));
  await checkHtml(path.join(root, 'dist/index.html'), path.join(root, 'dist'));
});

test('source ZIP excludes runtime state, secrets, generated archives and symlinks', async t => {
  const root = await fixture(t);
  for (const directory of ['.git', '.openai', 'node_modules', 'dist']) {
    await mkdir(path.join(root, directory));
    await writeFile(path.join(root, directory, 'private.txt'), 'DO_NOT_PACKAGE');
  }
  for (const name of ['.env', '.env.production', 'credentials.json', 'secrets.json', 'private.key', 'old.zip']) {
    await writeFile(path.join(root, name), 'DO_NOT_PACKAGE');
    await writeFile(path.join(root, 'lib', name), 'DO_NOT_PACKAGE');
  }
  await symlink('../.env', path.join(root, 'lib/linked.mjs'));
  await buildProject(root);
  const entries = readZip(await readFile(path.join(root, 'dist/downloads/interface-foundry-toolkit.zip')));
  for (const [name, content] of entries) {
    assert.doesNotMatch(name, /(?:\.git\/|\.openai\/|node_modules\/|dist\/|\.env|credentials|secrets|private\.key|old\.zip|linked\.mjs)/);
    assert.doesNotMatch(content.toString('utf8'), /DO_NOT_PACKAGE/);
  }
});

test('failed builds preserve prior output and refuse output or asset symlinks', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/previous.txt'), 'working deployment');
  await rm(path.join(root, 'skills/foundry-verify/SKILL.md'));
  await assert.rejects(buildProject(root), /ENOENT/);
  assert.equal(await readFile(path.join(root, 'dist/previous.txt'), 'utf8'), 'working deployment');
  await rm(path.join(root, 'dist'), { recursive: true });
  await symlink('assets', path.join(root, 'dist'));
  await assert.rejects(buildProject(root), /Refusing to replace dist/);
  assert.equal(await readFile(path.join(root, 'assets/app.js'), 'utf8'), 'console.log("fixture");');
  await rm(path.join(root, 'dist'));
  await symlink('../package.json', path.join(root, 'assets/linked.json'));
  await assert.rejects(buildProject(root), /must not be symlinks/);
});

test('ZIP rejects unsafe or duplicate entry paths and computes known CRC32 values', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  for (const name of ['../escape', '/absolute', 'folder/../escape', 'windows\\escape', 'folder//file']) assert.throws(() => createZip([{ name, data: 'x' }]), /Unsafe archive path/);
  assert.throws(() => createZip([{ name: 'same', data: 'a' }, { name: 'same', data: 'b' }]), /Duplicate archive path/);
});

test('HTML checks catch missing anchors, duplicate IDs, ARIA targets and assets', async t => {
  const root = await temporaryDirectory(t);
  const filename = path.join(root, 'index.html');
  for (const [html, expected] of [
    ['<a href="#missing">Link</a>', /Missing HTML anchor/],
    ['<h1 id="same">A</h1><p id="same">B</p>', /Duplicate or empty HTML id/],
    ['<button aria-controls="missing">Open</button>', /Missing aria-controls target/],
    ['<script src="missing.js"></script>', /ENOENT/]
  ]) {
    await writeFile(filename, html);
    await assert.rejects(checkHtml(filename, root), expected);
  }
  await writeFile(filename, '<h1 id="title">Valid</h1><button aria-describedby="title">Action</button><a href="#title">Title</a>');
  await checkHtml(filename, root);
});
