import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './index.mjs';
import { createStore } from './store.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'turbo-api-'));
  const app = createApp({ dataDir: directory, distDir: path.join(directory, 'dist'), initialProjects: [] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, directory };
}

const sample = { title: 'Turbo Studio', type: 'website', url: 'https://example.com', description: 'A place to create.', category: 'Creative', year: 2026, featured: true };
const headers = { 'Content-Type': 'application/json' };

test('empty collection, real project creation, persistence, and deletion', async (t) => {
  const { base, directory } = await fixture(t);
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), { projects: [] });
  const created = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify(sample) });
  assert.equal(created.status, 201);
  const { project } = await created.json();
  assert.equal(project.title, sample.title);
  assert.equal(project.url, 'https://example.com/');
  assert.equal(project.featured, true);
  assert.equal(project.type, 'website');
  assert.equal((await (await fetch(`${base}/api/projects`)).json()).projects[0].id, project.id);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'projects.json'), 'utf8'))[0].id, project.id);
  assert.equal((await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), { projects: [] });
  assert.equal((await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE' })).status, 404);
});

test('concurrent writes retain every project', async (t) => {
  const { base } = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ ...sample, title: `Project ${i}` }) })));
  assert.ok(responses.every((response) => response.status === 201));
  assert.equal((await (await fetch(`${base}/api/projects`)).json()).projects.length, 8);
});

test('initial projects are added once and stay removed after reopening storage', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'turbo-seed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seed = { ...sample, id: 'first-project' };
  const store = createStore(directory, [seed]);
  assert.deepEqual(await store.list(), [seed]);
  await store.remove(seed.id);
  assert.deepEqual(await createStore(directory, [seed]).list(), []);
});

test('validation rejects unsafe URLs, missing fields, invalid project types, and cross-site writes', async (t) => {
  const { base } = await fixture(t);
  for (const override of [
    { title: '' }, { type: 'script' }, { url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com' },
    { url: '' }, { year: 12 }, { featured: 'yes' }, { title: 'x'.repeat(101) },
  ]) {
    const response = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ ...sample, ...override }) });
    assert.equal(response.status, 400, JSON.stringify(override));
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const response = await fetch(`${base}/api/projects`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: JSON.stringify(sample) });
  assert.equal(response.status, 403);
  assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), { projects: [] });
});

test('actual multipart uploads persist, images display, and HTML downloads as an attachment', async (t) => {
  const { base, directory } = await fixture(t);
  const form = new FormData();
  form.set('title', 'Turbo App');
  form.set('type', 'app');
  form.set('description', 'Uploaded source');
  form.set('year', '2026');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZyQAAAAASUVORK5CYII=', 'base64');
  form.set('cover', new Blob([pixel], { type: 'image/png' }), 'cover.png');
  const contents = '<!doctype html><title>Turbo demo</title>';
  form.set('file', new Blob([contents], { type: 'text/html' }), 'my-site.html');
  const response = await fetch(`${base}/api/projects`, { method: 'POST', body: form });
  assert.equal(response.status, 201);
  const { project } = await response.json();
  assert.equal(project.url, '');
  assert.equal(project.fileName, 'my-site.html');
  const image = await fetch(`${base}${project.coverUrl}`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /^image\/png/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), pixel);
  const download = await fetch(`${base}${project.fileUrl}`);
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.match(download.headers.get('content-security-policy'), /sandbox/);
  assert.equal(await download.text(), contents);
  await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE' });
  assert.deepEqual(await readdir(path.join(directory, 'uploads')), []);
  assert.equal((await fetch(`${base}${project.coverUrl}`)).status, 404);
});

test('invalid cover image is rejected and uploaded files are removed', async (t) => {
  const { base, directory } = await fixture(t);
  const form = new FormData();
  form.set('title', 'Invalid image');
  form.set('type', 'website');
  form.set('url', 'https://example.com');
  form.set('cover', new Blob(['<script>not an image</script>'], { type: 'image/png' }), 'cover.png');
  const response = await fetch(`${base}/api/projects`, { method: 'POST', body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /image format/);
  assert.deepEqual(await readdir(path.join(directory, 'uploads')), []);
});

test('unlisted upload paths and invalid JSON return deliberate errors', async (t) => {
  const { base } = await fixture(t);
  assert.equal((await fetch(`${base}/uploads/00000000-0000-0000-0000-000000000000.html`)).status, 404);
  assert.equal((await fetch(`${base}/api/missing`)).status, 404);
  const invalid = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: '{not json' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'Send valid JSON.' });
});
