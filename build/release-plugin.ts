import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Plugin } from 'vite';

function sourceFingerprint(root: string): string {
  const hash = createHash('sha256');
  function visit(directory: string) {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch { return; }
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        hash.update(path.relative(root, filename));
        hash.update(readFileSync(filename));
      }
    }
  }
  visit(path.join(root, 'src'));
  visit(path.join(root, 'public'));
  for (const filename of ['index.html', 'package.json', 'vite.config.ts']) {
    try { hash.update(filename).update(readFileSync(path.join(root, filename))); } catch { /* Optional source files. */ }
  }
  return hash.digest('hex').slice(0, 40);
}

function commitIdentifier(root: string): string {
  const supplied = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (supplied && /^[a-zA-Z0-9._-]{1,100}$/.test(supplied)) return supplied;
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).trim();
  } catch { return sourceFingerprint(root); }
}

/** Each deployment carries its own release timestamp; visits never extend it. */
export function releasePlugin(): Plugin {
  let release = '';
  return {
    name: 'turbo-release-announcement',
    configResolved(config) {
      release = JSON.stringify({
        id: commitIdentifier(config.root),
        publishedAt: new Date().toISOString(),
        title: 'More ways to find your next world',
        description: 'Share section links, discover related worlds, and copy AI replies with a smoother browsing experience.',
      }, null, 2) + '\n';
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/release.json' || !['GET', 'HEAD'].includes(request.method || 'GET')) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(request.method === 'HEAD' ? undefined : release);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release.json', source: release });
    },
  };
}

export default releasePlugin;
