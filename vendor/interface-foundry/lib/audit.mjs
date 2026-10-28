import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const EXTENSIONS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.css']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', '.next', '.claude', '.agents']);
const MAX_SIZE = 1024 * 1024;

async function collect(target) {
  const stat = await lstat(target);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return EXTENSIONS.has(path.extname(target).toLowerCase()) ? [target] : [];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const item of await readdir(target, { withFileTypes: true })) {
    if (SKIP.has(item.name) || item.name.startsWith('.')) continue;
    if (!item.isSymbolicLink()) files.push(...await collect(path.join(target, item.name)));
  }
  return files.sort();
}

function attr(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const result = attributes.match(new RegExp(`(?:^|\\s)${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?(?=\\s|$)`, 'i'));
  return result ? result[1] ?? result[2] ?? result[3] ?? '' : null;
}

function blankComments(source) {
  // Preserve offsets so findings retain the original file's line numbers.
  return source.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, value => value.replace(/[^\n]/g, ' '));
}

export function inspectSource(source, filename) {
  const findings = [];
  const clean = blankComments(source);
  const extension = path.extname(filename).toLowerCase();
  const add = (rule, severity, index, message) => findings.push({
    rule, severity, file: filename,
    line: source.slice(0, index).split('\n').length, message
  });
  if (extension === '.css') {
    const motion = [...clean.matchAll(/\b(?:animation(?:-name)?|transition(?:-property)?)\s*:\s*([^;}]+)/gi)].find(match => {
      const value = match[1].trim().toLowerCase();
      if (/^(?:none|initial|unset|revert)(?:\s*!important)?$/.test(value)) return false;
      const times = [...value.matchAll(/(-?(?:\d*\.)?\d+)(?:ms|s)\b/g)];
      return !times.length || times.some(time => Number(time[1]) > 0);
    });
    if (motion && !/prefers-reduced-motion/i.test(clean)) add('reduced-motion', 'warning', motion.index, 'Motion declared without a reduced-motion query in this stylesheet. Check the combined styles and respect the user preference.');
    const removed = /(?:outline|outline-width)\s*:\s*(?:none|0(?:px)?)\s*[;}]/i.exec(clean);
    if (removed && !/:focus-visible|:focus\b/i.test(clean)) add('focus-indicator', 'warning', removed.index, 'An outline is removed without a focus selector in this stylesheet. Verify a visible replacement across all interactive controls.');
    return findings;
  }
  const markup = clean.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, value => value.replace(/[^\n]/g, ' '));
  const tags = [...markup.matchAll(/<(html|img|input|button)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)];
  const labels = [...markup.matchAll(/<label\b([^>]*)>[\s\S]*?<\/label\s*>/gi)];
  for (const match of tags) {
    const tag = match[1].toLowerCase();
    // Capitalized JSX names are custom components, not native HTML elements.
    if (['.jsx', '.tsx'].includes(extension) && match[1] !== tag) continue;
    const attributes = match[2];
    const get = name => attr(attributes, name) ?? (extension === '.vue' ? attr(attributes, `:${name}`) ?? attr(attributes, `v-bind:${name}`) : null);
    const dynamic = /\{\.\.\./.test(attributes) || (extension === '.vue' && attr(attributes, 'v-bind') !== null);
    if (tag === 'html' && get('lang') === null && !dynamic) add('document-language', 'error', match.index, 'The document has no lang attribute. Declare its primary language.');
    if (tag === 'img' && get('alt') === null && !dynamic) add('image-alt', 'error', match.index, 'Image has no alt attribute. Describe its purpose, or use alt="" for a decorative image.');
    if (tag === 'input' && !dynamic) {
      const type = (attr(attributes, 'type') ?? 'text').toLowerCase();
      if (['hidden', 'submit', 'reset', 'button'].includes(type)) continue;
      const id = attr(attributes, 'id');
      if (id?.startsWith('{')) continue;
      const accessible = (get('aria-label') ?? '').trim() || (get('aria-labelledby') ?? '').trim() || (get('title') ?? '').trim() || (type === 'image' && (get('alt') ?? '').trim());
      const associated = labels.some(label => (match.index > label.index && match.index < label.index + label[0].length) || (id && (attr(label[1], 'for') === id || attr(label[1], 'htmlFor') === id)));
      if (!accessible && !associated) add('input-label', 'warning', match.index, 'No label found in this file for this input. Check component composition, then add an associated label or accessible name.');
    }
    if (tag === 'button' && !dynamic && !(get('aria-label') ?? '').trim() && !(get('aria-labelledby') ?? '').trim() && !(get('title') ?? '').trim()) {
      const remainder = markup.slice(match.index + match[0].length);
      const end = remainder.search(/<\/button\s*>/i);
      if (end !== -1 && !remainder.slice(0, end).trim()) add('empty-button', 'error', match.index, 'Button is empty and has no explicit accessible name. Give the action a visible label.');
    }
  }
  if (['.html', '.htm'].includes(extension) && /<html\b|<!doctype\s+html/i.test(markup)) {
    if (!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(markup)) add('document-title', 'error', 0, 'Full HTML document has no nonempty title. Give the page a useful name.');
    if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(markup)) add('viewport', 'warning', 0, 'No viewport meta tag found. Check mobile layout and add width=device-width, initial-scale=1.');
  }
  return findings;
}

export async function audit(target) {
  const targetStat = await lstat(target);
  const base = targetStat.isDirectory() ? target : path.dirname(target);
  const files = await collect(target);
  const findings = [];
  const skipped = [];
  let filesScanned = 0;
  for (const file of files) {
    const stat = await lstat(file);
    const relative = path.relative(base, file).split(path.sep).join('/');
    if (stat.size > MAX_SIZE) { skipped.push({ file: relative, reason: 'Larger than 1 MiB.' }); continue; }
    findings.push(...inspectSource(await readFile(file, 'utf8'), relative));
    filesScanned++;
  }
  if (!filesScanned) findings.push({ rule: 'no-source-files', severity: 'warning', file: '.', line: 1, message: 'No supported source files found. Supported: HTML, JSX, TSX, Vue, Svelte, CSS.' });
  return {
    schemaVersion: 1,
    filesScanned,
    summary: { errors: findings.filter(x => x.severity === 'error').length, warnings: findings.filter(x => x.severity === 'warning').length },
    findings, skipped,
    limitations: 'Source heuristics only; dynamic components and cross-file labels/styles may need review. No browser, computed contrast, or WCAG certification.',
    manualChecks: ['keyboard and visible focus', 'computed color contrast', '360px layout and 200% zoom', 'reduced motion', 'complete success and failure flows']
  };
}
