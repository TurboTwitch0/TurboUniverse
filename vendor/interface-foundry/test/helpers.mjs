import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repository = fileURLToPath(new URL('../', import.meta.url));

export async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'foundry-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

export function cli(args, cwd = repository) {
  const result = spawnSync(process.execPath, [path.join(repository, 'bin/foundry.mjs'), ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

export async function snapshot(directory) {
  const files = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) {
      for (const [relative, content] of Object.entries(await snapshot(filename))) files[path.join(item.name, relative)] = content;
    } else if (item.isFile()) files[item.name] = await readFile(filename, 'utf8');
  }
  return files;
}
