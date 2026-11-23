import http from 'node:http';
import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../dist/', import.meta.url))).catch(() => {
  throw new Error('Built site not found. Run npm run build first, or use npm start.');
});
const insideRoot = filename => {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json; charset=utf-8', '.zip': 'application/zip', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const requested = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!insideRoot(requested)) { response.writeHead(403); response.end('Forbidden'); return; }
    const filename = await realpath(requested);
    if (!insideRoot(filename)) { response.writeHead(403); response.end('Forbidden'); return; }
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Interface Foundry · http://127.0.0.1:${server.address().port}`));
