import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createVercelApp, MAX_UPLOAD_BYTES } from '../api/index.mjs';
import { createBlobStore } from './blob-store.mjs';

function fakeBlobSDK() {
  const blobs = new Map();
  const optionsSeen = [];
  return {
    blobs, optionsSeen,
    async put(pathname, contents, options) {
      optionsSeen.push({ method: 'put', options });
      if (options.allowOverwrite === false && blobs.has(pathname)) throw new Error('Already exists');
      blobs.set(pathname, { bytes: Buffer.from(contents), contentType: options.contentType });
      return { pathname, url: `https://private.example/${pathname}` };
    },
    async get(pathname, options) {
      optionsSeen.push({ method: 'get', options });
      const entry = blobs.get(pathname);
      return entry ? { statusCode: 200, stream: new Blob([entry.bytes]).stream(), blob: { pathname, contentType: entry.contentType } } : null;
    },
    async list({ prefix, cursor }) {
      const entries = [...blobs.keys()].filter(pathname => pathname.startsWith(prefix)).sort();
      const offset = Number(cursor || 0);
      return { blobs: entries.slice(offset, offset + 2).map(pathname => ({ pathname })), hasMore: entries.length > offset + 2, cursor: entries.length > offset + 2 ? String(offset + 2) : undefined };
    },
    async del(pathname) { blobs.delete(pathname); },
  };
}

const seed = { id: 'starter-project', title: 'Turbo seed', type: 'website', url: 'https://example.com/seed', description: '', category: 'Creative', year: 2026, featured: true, createdAt: '2026-01-01T00:00:00Z' };
const sample = { title: 'Turbo Studio', type: 'website', url: 'https://example.com', description: 'A place to create.', category: 'Creative', year: 2026, featured: true };
const adminKey = 'test-owner-key-never-used-in-production';
const auth = { Authorization: `Bearer ${adminKey}` };

async function fixture(t, options = {}) {
  const server = createVercelApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Vercel publishes the real starter collection without credentials or writable disk', async t => {
  const base = await fixture(t, { blobToken: '', adminKey: '' });
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { canManage: false, requiresLogin: false, maxUploadBytes: MAX_UPLOAD_BYTES, storage: 'catalog' });
  const listing = await fetch(`${base}/api/projects`);
  assert.equal(listing.headers.get('cache-control'), 'no-store');
  assert.equal((await listing.json()).projects.length, 30);
  assert.equal((await fetch(`${base}/api/admin`)).status, 401);
  const create = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) });
  assert.equal(create.status, 503);
  assert.match((await create.json()).error, /viewing mode/);
});

test('independent serverless instances retain concurrent project records and seed tombstones', async () => {
  const sdk = fakeBlobSDK();
  const a = createBlobStore({ token: 'fake-token', sdk, initialProjects: [seed] });
  const b = createBlobStore({ token: 'fake-token', sdk, initialProjects: [seed] });
  await Promise.all(Array.from({ length: 11 }, (_, index) => (index % 2 ? a : b).add({ ...sample, id: randomUUID(), title: `Project ${index}`, createdAt: '2026-01-02T00:00:00Z' })));
  assert.equal((await a.list()).length, 12, 'all pages and concurrent records are retained');
  assert.equal((await b.remove(seed.id)).id, seed.id);
  const reopened = createBlobStore({ token: 'fake-token', sdk, initialProjects: [seed] });
  assert.equal((await reopened.list()).length, 11);
  assert.equal((await reopened.list()).some(project => project.id === seed.id), false);
  assert.ok(sdk.optionsSeen.filter(entry => entry.method === 'get').every(entry => entry.options.access === 'private' && entry.options.useCache === false));
  assert.ok(sdk.optionsSeen.filter(entry => entry.method === 'put').every(entry => entry.options.access === 'private' && entry.options.addRandomSuffix === false));
});

test('Vercel mutations require owner access and reject cross-origin writes', async t => {
  const sdk = fakeBlobSDK();
  const base = await fixture(t, { blobToken: 'fake-token', adminKey, blobSDK: sdk, initialProjects: [seed] });
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { canManage: true, requiresLogin: true, maxUploadBytes: MAX_UPLOAD_BYTES, storage: 'blob' });
  assert.equal((await fetch(`${base}/api/admin`, { headers: auth })).status, 200);
  const post = headers => fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(sample) });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ Authorization: 'Bearer wrong-key' })).status, 401);
  assert.equal((await post({ ...auth, Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post({ ...auth, Origin: base })).status, 201);
  assert.equal((await (await fetch(`${base}/api/projects`)).json()).projects.length, 2);
  assert.equal((await fetch(`${base}/api/projects/${seed.id}`, { method: 'DELETE', headers: auth })).status, 200);
  assert.equal((await fetch(`${base}/api/projects/${seed.id}`, { method: 'DELETE', headers: auth })).status, 404);
});

test('Vercel cover and downloadable files persist privately across handler instances', async t => {
  const sdk = fakeBlobSDK();
  const settings = { blobToken: 'fake-token', adminKey, blobSDK: sdk, initialProjects: [] };
  const base = await fixture(t, settings);
  const form = new FormData();
  form.set('title', 'Uploaded Turbo app'); form.set('type', 'app'); form.set('year', '2026');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZyQAAAAASUVORK5CYII=', 'base64');
  form.set('cover', new Blob([pixel], { type: 'image/png' }), 'cover.png');
  form.set('file', new Blob(['<h1>Uploaded app</h1>'], { type: 'text/html' }), 'app.html');
  const creation = await fetch(`${base}/api/projects`, { method: 'POST', headers: auth, body: form });
  assert.equal(creation.status, 201);
  const { project } = await creation.json();
  const nextInstance = await fixture(t, settings);
  assert.equal((await (await fetch(`${nextInstance}/api/projects`)).json()).projects[0].id, project.id);
  const image = await fetch(`${nextInstance}${project.coverUrl}`);
  assert.match(image.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), pixel);
  const file = await fetch(`${nextInstance}${project.fileUrl}`);
  assert.match(file.headers.get('content-disposition'), /^attachment;/);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  assert.equal(await file.text(), '<h1>Uploaded app</h1>');
  await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE', headers: auth });
  assert.equal((await fetch(`${nextInstance}${project.coverUrl}`)).status, 404);
  assert.equal([...sdk.blobs.keys()].filter(key => key.includes('/assets/')).length, 0);
});

test('Vercel validates payloads and rejects oversized aggregate uploads without blob writes', async t => {
  const sdk = fakeBlobSDK();
  const base = await fixture(t, { blobToken: 'fake-token', adminKey, blobSDK: sdk, initialProjects: [] });
  for (const override of [{ title: '' }, { type: 'unsafe' }, { url: 'javascript:alert(1)' }, { year: 12 }, { featured: 'yes' }]) {
    assert.equal((await fetch(`${base}/api/projects`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sample, ...override }) })).status, 400);
  }
  const form = new FormData();
  form.set('title', 'Oversized'); form.set('type', 'app'); form.set('year', '2026');
  const image = Buffer.alloc(2_020_000); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  form.set('cover', new Blob([image], { type: 'image/png' }), 'cover.png');
  form.set('file', new Blob([Buffer.alloc(2_020_000)], { type: 'application/zip' }), 'app.zip');
  assert.equal((await fetch(`${base}/api/projects`, { method: 'POST', headers: auth, body: form })).status, 413);
  assert.equal(sdk.blobs.size, 0);
});

test('Vercel storage failures return a safe error without credential details', async t => {
  const base = await fixture(t, { blobToken: 'fake-token', adminKey, store: { list: async () => { throw new Error('fake-sensitive-provider-error'); } } });
  const response = await fetch(`${base}/api/projects`);
  assert.equal(response.status, 500);
  const payload = await response.text();
  assert.doesNotMatch(payload, /fake-sensitive-provider-error|fake-token/);
  assert.match(payload, /could not be loaded or saved/);
});
