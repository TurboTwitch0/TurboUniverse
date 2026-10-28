import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSourceArchive } from './archive.mjs';

export const SKILL_MAP = Object.freeze({
  direction: 'foundry-direction', audit: 'foundry-audit', reference: 'foundry-reference',
  reconstruct: 'foundry-reconstruct', verify: 'foundry-verify'
});

async function copyAssets(source, destination) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Static assets must not be symlinks: ${source}`);
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) {
      if (name.startsWith('.') || /\.(?:pem|key|p12|pfx)$/i.test(name) || /(?:^|[._-])(?:secrets?|credentials?|tokens?)(?:[._-]|$)/i.test(name)) continue;
      await copyAssets(path.join(source, name), path.join(destination, name));
    }
  } else if (stat.isFile()) await writeFile(destination, await readFile(source));
  else throw new Error(`Unsupported static asset: ${source}`);
}

export async function buildProject(project) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
  const root = await realpath(project);
  const destination = path.join(root, 'dist');
  let previous;
  try { previous = await lstat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && (!previous.isDirectory() || previous.isSymbolicLink())) throw new Error('Refusing to replace dist: expected an ordinary output directory.');
  const stage = await mkdtemp(path.join(root, '.foundry-build-'));
  const fresh = path.join(stage, 'site');
  const backup = path.join(stage, 'previous');
  let oldMoved = false;
  let committed = false;
  try {
    await mkdir(fresh);
    const sourceIndex = path.join(root, 'index.html');
    if (!(await lstat(sourceIndex)).isFile()) throw new Error('index.html must be an ordinary source file.');
    await writeFile(path.join(fresh, 'index.html'), await readFile(sourceIndex));
    await copyAssets(path.join(root, 'assets'), path.join(fresh, 'assets'));
    const skillRoot = await lstat(path.join(root, 'skills'));
    if (!skillRoot.isDirectory() || skillRoot.isSymbolicLink()) throw new Error('skills must be an ordinary source directory.');
    const skills = {};
    for (const [key, name] of Object.entries(SKILL_MAP)) {
      const skillDirectory = path.join(root, 'skills', name);
      const directoryStat = await lstat(skillDirectory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error(`Skill directory must not be a symlink: ${name}`);
      const filename = path.join(skillDirectory, 'SKILL.md');
      if (!(await lstat(filename)).isFile()) throw new Error(`Skill must be an ordinary source file: ${name}`);
      skills[key] = await readFile(filename, 'utf8');
    }
    await mkdir(path.join(fresh, 'data'));
    await writeFile(path.join(fresh, 'data', 'skills.json'), `${JSON.stringify(skills, null, 2)}\n`);
    await mkdir(path.join(fresh, 'downloads'));
    const archive = await createSourceArchive(root);
    await writeFile(path.join(fresh, 'downloads', 'interface-foundry-toolkit.zip'), archive);
    if (previous) { await rename(destination, backup); oldMoved = true; }
    try { await rename(fresh, destination); }
    catch (error) {
      if (oldMoved) {
        try { await rename(backup, destination); oldMoved = false; }
        catch { throw new Error(`Output replacement failed; previous output is preserved at ${backup}`, { cause: error }); }
      }
      throw error;
    }
    committed = true;
    return { directory: destination, skills: Object.keys(skills).length, archiveBytes: archive.length };
  } finally {
    if (committed || !oldMoved) await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildProject(fileURLToPath(new URL('../', import.meta.url)))
    .then(result => console.log(`Built ${result.directory} · ${result.skills} skills · ${result.archiveBytes} byte source ZIP`))
    .catch(error => { console.error(`Build: ${error.message}`); process.exitCode = 1; });
}
