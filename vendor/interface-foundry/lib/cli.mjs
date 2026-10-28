import { readdir, readFile, lstat, mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './audit.mjs';
import { createBrief } from './brief.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SKILLS = ['foundry-direction', 'foundry-audit', 'foundry-reference', 'foundry-reconstruct', 'foundry-verify'];
const HELP = `Interface Foundry — make intentional interfaces.

Usage: node bin/foundry.mjs <command> [path] [options]

  init <project>    Install five skills into a project (no dependencies).
    --agent claude|codex|both   Default: claude
  brief            Print an editable design brief with matching CSS tokens.
    --name <name> --audience <audience> --goal <goal>
    --direction editorial|studio|terminal   Default: editorial
    --out <file>    Save a new file; existing files are never overwritten.
  audit [path]     Scan HTML/JSX/TSX/Vue/Svelte/CSS source (default: .).
    --format text|json         Default: text
    --fail-on error|warning|never   Default: error
  doctor           Check this installation and runtime.
  help             Show this help.

Audit findings are source heuristics, not a browser or WCAG certification.
No network requests, API keys, telemetry, or automatic dependency installs.
`;

function parse(args, allowed) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      if (!allowed.includes(key)) throw new Error(`Unknown option: ${value}`);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${value}`);
      options[key] = args[++i];
    } else positional.push(value);
  }
  return { options, positional };
}

async function statOrNull(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function sourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Skill source contains a symlink: ${file}`);
    if (entry.isDirectory()) files.push(...await sourceFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

async function assertSafeDestination(root, destination) {
  const relative = path.relative(root, destination);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Destination must stay inside the project.');
  const segments = relative.split(path.sep);
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    const stat = await statOrNull(current);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing to write through a symlink: ${current}`);
    if (stat && i < segments.length - 1 && !stat.isDirectory()) throw new Error(`Expected a directory: ${current}`);
    if (stat && i === segments.length - 1 && !stat.isFile()) throw new Error(`Expected a regular file: ${current}`);
  }
}

export async function installSkills(project, agent = 'claude') {
  const agents = { claude: ['.claude'], codex: ['.agents'], both: ['.claude', '.agents'] };
  if (!Object.hasOwn(agents, agent)) throw new Error('Agent must be claude, codex, or both.');
  const root = await realpath(project);
  if (!(await lstat(root)).isDirectory()) throw new Error('Project path must be an existing directory.');
  const pending = [];
  let unchanged = 0;
  for (const destinationAgent of agents[agent]) {
    for (const skill of SKILLS) {
      const source = path.join(ROOT, 'skills', skill);
      for (const file of await sourceFiles(source)) {
        const destination = path.join(root, destinationAgent, 'skills', skill, path.relative(source, file));
        await assertSafeDestination(root, destination);
        const content = await readFile(file);
        const stat = await statOrNull(destination);
        if (stat) {
          if (!(await readFile(destination)).equals(content)) throw new Error(`Existing file differs; nothing was installed. Move it aside before retrying: ${destination}`);
          unchanged++;
        } else pending.push({ destination, content });
      }
    }
  }
  // Preflight all destinations before making any changes. Exclusive creation also
  // prevents an existing file from being overwritten if it appears during install.
  for (const { destination, content } of pending) {
    await assertSafeDestination(root, destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { flag: 'wx' });
  }
  return { project: root, agent, skills: SKILLS.length, written: pending.length, unchanged };
}

export async function run(args, output = console) {
  const [command = 'help', ...rest] = args;
  if (['help', '--help', '-h'].includes(command)) { output.log(HELP); return 0; }
  if (command === '--version') { output.log(JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version); return 0; }
  if (command === 'init') {
    const { options, positional } = parse(rest, ['agent']);
    if (positional.length !== 1) throw new Error('Usage: init <existing-project-directory> [--agent claude|codex|both]');
    const result = await installSkills(path.resolve(positional[0]), options.agent);
    output.log(`Installed ${result.skills} skills for ${result.agent} in ${result.project}\n${result.written} files created; ${result.unchanged} identical files kept.`);
    return 0;
  }
  if (command === 'brief') {
    const { options, positional } = parse(rest, ['name', 'audience', 'goal', 'direction', 'out']);
    if (positional.length) throw new Error('brief accepts named options, not a project path.');
    const brief = createBrief(options);
    if (options.out) {
      await writeFile(path.resolve(options.out), brief, { flag: 'wx' });
      output.log(`Created ${path.resolve(options.out)}`);
    } else output.log(brief);
    return 0;
  }
  if (command === 'audit') {
    const { options, positional } = parse(rest, ['format', 'fail-on']);
    if (positional.length > 1) throw new Error('audit accepts at most one path.');
    const format = options.format ?? 'text';
    const failOn = options['fail-on'] ?? 'error';
    if (!['text', 'json'].includes(format)) throw new Error('Format must be text or json.');
    if (!['error', 'warning', 'never'].includes(failOn)) throw new Error('fail-on must be error, warning, or never.');
    const report = await audit(path.resolve(positional[0] ?? '.'));
    if (format === 'json') output.log(JSON.stringify(report, null, 2));
    else {
      output.log(`Interface Foundry · source audit\n${report.filesScanned} files scanned · ${report.summary.errors} errors · ${report.summary.warnings} warnings`);
      for (const finding of report.findings) output.log(`${finding.severity.toUpperCase()} ${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
      output.log(`\n${report.limitations}\nStill verify: ${report.manualChecks.join('; ')}.`);
    }
    return failOn !== 'never' && (report.summary.errors > 0 || (failOn === 'warning' && report.summary.warnings > 0)) ? 1 : 0;
  }
  if (command === 'doctor') {
    if (rest.length) throw new Error('doctor takes no arguments.');
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
    for (const skill of SKILLS) {
      const content = await readFile(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
      if (!content.includes(`name: ${skill}`) || !/^description:/m.test(content)) throw new Error(`Invalid skill: ${skill}`);
    }
    output.log(`Ready · Node ${process.versions.node} · ${SKILLS.length} skills available\nNo dependencies or credentials required.`);
    return 0;
  }
  throw new Error(`Unknown command: ${command}. Run help for usage.`);
}
