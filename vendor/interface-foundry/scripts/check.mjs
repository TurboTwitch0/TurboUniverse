import { access, lstat, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_MAP } from './build.mjs';

const GENERATED = new Set(['data/skills.json', 'downloads/interface-foundry-toolkit.zip']);
const CODE_DIRECTORIES = ['assets', 'bin', 'lib', 'scripts', 'test'];

async function exists(filename) {
  try { await access(filename); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function codeFiles(directory) {
  const result = [];
  if (!await exists(directory)) return result;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await codeFiles(filename));
    else if (entry.isFile() && ['.js', '.mjs'].includes(path.extname(filename))) result.push(filename);
  }
  return result;
}

function attribute(attributes, name) {
  return attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(value => value !== undefined);
}

export async function checkHtml(filename, root, { source = false } = {}) {
  const html = (await readFile(filename, 'utf8')).replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const tags = [...html.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)];
  const ids = new Set();
  for (const [, , attributes] of tags) {
    const id = attribute(attributes, 'id');
    if (id !== undefined) {
      if (!id || ids.has(id)) throw new Error(`Duplicate or empty HTML id in ${filename}: ${id}`);
      ids.add(id);
    }
  }
  for (const [, tag, attributes] of tags) {
    for (const name of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      const references = attribute(attributes, name);
      if (references) for (const id of references.trim().split(/\s+/)) if (!ids.has(id)) throw new Error(`Missing ${name} target in ${filename}: ${id}`);
    }
    const value = attribute(attributes, ['script', 'img', 'source', 'iframe'].includes(tag.toLowerCase()) ? 'src' : 'href');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;
    const url = new URL(value, 'https://foundry.invalid/');
    if (url.origin !== 'https://foundry.invalid') continue;
    if (value.startsWith('#')) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (id && !ids.has(id)) throw new Error(`Missing HTML anchor in ${filename}: ${value}`);
      continue;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const local = path.resolve(root, relative);
    const containment = path.relative(root, local);
    if (containment === '..' || containment.startsWith(`..${path.sep}`) || path.isAbsolute(containment)) throw new Error(`Asset escapes site root: ${value}`);
    if (source && GENERATED.has(relative)) continue;
    await access(local);
  }
  // Script bodies were removed above so IDs inside JS templates do not count;
  // validate script sources separately from the original document.
  for (const match of (await readFile(filename, 'utf8')).matchAll(/<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)) {
    const src = attribute(match[1], 'src');
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) continue;
    const local = path.resolve(root, decodeURIComponent(new URL(src, 'https://foundry.invalid/').pathname).replace(/^\/+/, ''));
    const relative = path.relative(root, local);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Script escapes site root: ${src}`);
    await access(local);
  }
  return { ids: ids.size };
}

export async function checkProject(root) {
  let checked = 0;
  for (const directory of CODE_DIRECTORIES) {
    for (const filename of await codeFiles(path.join(root, directory))) {
      const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr.trim());
      checked++;
    }
  }
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const filename of Object.values(typeof pkg.bin === 'string' ? { bin: pkg.bin } : pkg.bin ?? {})) await access(path.join(root, filename));
  for (const name of Object.values(SKILL_MAP)) {
    const filename = path.join(root, 'skills', name, 'SKILL.md');
    const content = await readFile(filename, 'utf8');
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!frontmatter || !frontmatter[1].split(/\r?\n/).includes(`name: ${name}`) || !/^description: .+/m.test(frontmatter[1])) throw new Error(`Invalid skill frontmatter: ${name}`);
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      if (!/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(match[1])) await access(path.resolve(path.dirname(filename), match[1]));
    }
  }
  await checkHtml(path.join(root, 'index.html'), root, { source: true });
  const output = path.join(root, 'dist');
  if (await exists(output)) {
    if (!(await lstat(output)).isDirectory()) throw new Error('dist must be a build output directory.');
    await checkHtml(path.join(output, 'index.html'), output);
    const skills = JSON.parse(await readFile(path.join(output, 'data/skills.json'), 'utf8'));
    if (Object.keys(skills).sort().join(',') !== Object.keys(SKILL_MAP).sort().join(',')) throw new Error('Built skills data has unexpected keys.');
    for (const [key, name] of Object.entries(SKILL_MAP)) {
      if (skills[key] !== await readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')) throw new Error(`Built skill is stale: ${key}`);
    }
    const zip = await readFile(path.join(output, 'downloads/interface-foundry-toolkit.zip'));
    if (zip.length < 22 || zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt32LE(zip.length - 22) !== 0x06054b50) throw new Error('Missing or invalid built toolkit ZIP.');
  }
  return { javascriptFiles: checked, skills: Object.keys(SKILL_MAP).length, built: await exists(output) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkProject(fileURLToPath(new URL('../', import.meta.url)))
    .then(result => console.log(`Checks passed · ${result.javascriptFiles} JavaScript files · ${result.skills} skills · source assets, IDs and ARIA references${result.built ? ' · built resources' : ''}.`))
    .catch(error => { console.error(`Check: ${error.message}`); process.exitCode = 1; });
}
