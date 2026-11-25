import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releasePlugin } from '../build/release-plugin.ts';

function releaseId(root) {
  const plugin = releasePlugin();
  plugin.configResolved({ root });
  const assets = [];
  plugin.generateBundle.call({ emitFile(asset) { assets.push(asset); } }, {}, {});
  return JSON.parse(assets.find(asset => asset.fileName === 'release.json').source).id;
}

test('manual builds identify catalog, embedded app and backend updates without Git metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'turbo-release-'));
  const suppliedCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  async function write(name, contents) {
    const filename = path.join(root, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, contents);
  }
  try {
    await write('src/App.tsx', 'export default function App() {}');
    let previous = releaseId(root);
    assert.match(previous, /^[0-9a-f]{40}$/);
    assert.equal(releaseId(root), previous, 'Repeated builds of the same sources keep their identity');
    for (const name of ['server/catalog.json', 'api/index.mjs', 'integrations/interface-foundry/reader.css', 'vendor/interface-foundry.upstream.json', 'build/release-plugin.ts', 'package-lock.json', 'vercel.json']) {
      await write(name, `Changed runtime input: ${name}`);
      const next = releaseId(root);
      assert.notEqual(next, previous, `${name} creates a new release identity`);
      previous = next;
    }
    await write('README.md', 'Documentation');
    await write('dist/release.json', 'Previous generated output');
    await write('vendor/interface-foundry/dist/index.html', 'Generated embedded output');
    assert.equal(releaseId(root), previous, 'Documentation and generated files do not change the source identity');
    process.env.VERCEL_GIT_COMMIT_SHA = 'explicit-deployment-commit';
    assert.equal(releaseId(root), 'explicit-deployment-commit');
  } finally {
    if (suppliedCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = suppliedCommit;
    await rm(root, { recursive: true, force: true });
  }
});
