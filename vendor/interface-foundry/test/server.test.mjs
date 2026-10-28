import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { ROOT } from '../lib/cli.mjs';
import { temporaryDirectory } from './helpers.mjs';

test('preview serves local assets, returns 404, and refuses symlinks to outside files', async t => {
  const fixture = await temporaryDirectory(t);
  await mkdir(path.join(fixture, 'scripts'));
  await mkdir(path.join(fixture, 'dist'));
  await copyFile(path.join(ROOT, 'scripts/serve.mjs'), path.join(fixture, 'scripts/serve.mjs'));
  await writeFile(path.join(fixture, 'dist/index.html'), '<!doctype html><title>Preview fixture</title>');
  await writeFile(path.join(fixture, 'dist/skills.json'), '{"direction":"test"}');
  await writeFile(path.join(fixture, 'private.txt'), 'must not be served');
  await symlink('../private.txt', path.join(fixture, 'dist/linked.txt'));
  const server = spawn(process.execPath, [path.join(fixture, 'scripts/serve.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const stopped = once(server, 'exit');
  t.after(async () => { server.kill(); await stopped; });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Preview did not start')), 5000);
    server.once('error', reject);
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Preview exited before startup')); });
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Preview fixture/);
  const data = await fetch(`${origin}/skills.json`);
  assert.match(data.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await data.json(), { direction: 'test' });
  assert.equal((await fetch(`${origin}/missing`)).status, 404);
  const forbidden = await fetch(`${origin}/linked.txt`);
  assert.equal(forbidden.status, 403);
  assert.doesNotMatch(await forbidden.text(), /must not be served/);
});
