import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const source = path.join(root, 'vendor', 'interface-foundry');
const pinned = JSON.parse(await readFile(path.join(root, 'vendor', 'interface-foundry.upstream.json'), 'utf8'));
for (const file of pinned.files) {
  const target = path.resolve(source, file.path);
  if (!target.startsWith(source + path.sep) || !(await lstat(target)).isFile() || (await lstat(target)).isSymbolicLink()) throw new Error(`Invalid pinned source: ${file.path}`);
  if (createHash('sha256').update(await readFile(target)).digest('hex') !== file.sha256) throw new Error(`Interface Foundry source differs from pinned revision: ${file.path}`);
}

const { buildProject } = await import('../vendor/interface-foundry/scripts/build.mjs');
const result = await buildProject(source);
const outputRoot = path.join(root, 'dist');
await mkdir(outputRoot, { recursive: true });
if ((await lstat(outputRoot)).isSymbolicLink() || !(await lstat(outputRoot)).isDirectory()) throw new Error('Expected an ordinary generated dist directory.');
const output = path.resolve(outputRoot, 'interface-foundry');
if (path.relative(root, output) !== path.join('dist', 'interface-foundry')) throw new Error('Unexpected generated sub-app location.');
try { if ((await lstat(output)).isSymbolicLink()) throw new Error('Refusing a symlinked sub-app output.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(output, { recursive: true, force: true });
await cp(result.directory, output, { recursive: true });

const filename = path.join(output, 'index.html');
let html = await readFile(filename, 'utf8');
html = html.replace('<head>', '<head>\n  <base href="/interface-foundry/">');
html = html.replace('</body>', '<div class="wrap" style="padding-top:8px;padding-bottom:24px;font-size:12px"><a href="/">Back to TurboUniverse</a> · <a href="LICENSE.txt">MIT license</a> · <a href="provenance.json">Source version</a></div>\n</body>');
await writeFile(filename, html);
await writeFile(path.join(output, 'LICENSE.txt'), await readFile(path.join(source, 'LICENSE')));
const files = [];
for (const name of ['index.html', 'assets/app.js', 'assets/styles.css', 'data/skills.json', 'downloads/interface-foundry-toolkit.zip', 'LICENSE.txt']) {
  const bytes = await readFile(path.join(output, name));
  files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(output, 'provenance.json'), JSON.stringify({
  name: pinned.name, repository: pinned.repository, commit: pinned.commit, license: pinned.license,
  copyright: pinned.copyright, mountPath: pinned.mountPath,
  adaptations: ['Added the hub subpath base URL and footer links to the hub, license, and source provenance.'],
  files,
}, null, 2) + '\n');
console.log(`Interface Foundry: ${result.skills} full skills, complete toolkit ZIP, and static assets built at ${pinned.mountPath} from ${pinned.commit}.`);
