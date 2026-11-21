import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './index.mjs';
import { createVercelApp } from '../api/index.mjs';

const project = { title: 'Compressed request', type: 'website', url: 'https://example.com/compressed', category: 'Tools', year: 2026 };

for (const adapter of ['local', 'Vercel']) {
  test(`${adapter}: malformed compressed requests cannot crash the API or save projects`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'turbo-compressed-'));
    const projects = [];
    const auth = adapter === 'Vercel' ? { Authorization: 'Bearer isolated-test-key' } : {};
    const app = adapter === 'local'
      ? createApp({ dataDir: directory, initialProjects: [] })
      : createVercelApp({ blobToken: 'isolated-test-store', adminKey: 'isolated-test-key', initialProjects: [], store: {
        list: async () => projects,
        add: async value => { projects.push(value); return value; },
      } });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
      await new Promise(resolve => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = body => fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', ...auth }, body,
    });
    const valid = await post(gzipSync(JSON.stringify(project)));
    assert.equal(valid.status, 201);
    await valid.arrayBuffer();
    for (const body of [Buffer.concat([gzipSync(JSON.stringify(project)), Buffer.from('invalid trailing bytes')]), Buffer.from('not a compressed stream')]) {
      const rejected = await post(body);
      assert.equal(rejected.status, 400);
      assert.equal(typeof (await rejected.json()).error, 'string');
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
    }
    const saved = (await (await fetch(`${base}/api/projects`)).json()).projects;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].title, project.title);
  });
}
