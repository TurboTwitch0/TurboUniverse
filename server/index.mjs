import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import catalog from './catalog.json' with { type: 'json' };

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const imageTypes = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const fileExtensions = new Set([
  '.zip', '.html', '.htm', '.apk', '.aab', '.ipa', '.pdf', '.exe', '.msi', '.dmg',
  '.tar', '.gz', '.tgz', '.7z', '.rar', '.txt', '.json', '.js', '.css', '.wasm', '.jar',
]);

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value, field, maximum, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw invalid(`${field} must be text.`);
  const cleaned = value.trim();
  if (required && !cleaned) throw invalid(`${field} is required.`);
  if (cleaned.length > maximum) throw invalid(`${field} must be ${maximum} characters or fewer.`);
  return cleaned;
}

function cleanUrl(value) {
  const raw = text(value, 'URL', 2048);
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw invalid('Enter a complete website URL beginning with https:// or http://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw invalid('Project URLs must use http:// or https:// without a username or password.');
  }
  return url.href;
}

function imageMatches(bytes, mime) {
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
  if (mime === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function cleanFileName(original) {
  return path.basename(original.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'project-file';
}

const initialTurboHome = () => catalog.map(project => ({ ...project }));

export function createApp({ dataDir = process.env.DATA_DIR || path.join(repositoryRoot, 'data'), distDir = path.join(repositoryRoot, 'dist'), initialProjects = initialTurboHome() } = {}) {
  const app = express();
  dataDir = path.resolve(dataDir);
  distDir = path.resolve(distDir);
  const uploadsDir = path.join(dataDir, 'uploads');
  const store = createStore(dataDir, initialProjects);
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  // Browsers may read this local server through the Vite proxy. Cross-site writes
  // from unrelated pages must not modify the single-owner project collection.
  app.use('/api', (request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin) {
      let origin;
      try { origin = new URL(request.headers.origin); } catch { return next(invalid('Unrecognized request origin.', 403)); }
      const requestHost = request.headers.host?.split(':')[0];
      if (origin.hostname !== requestHost && !(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && ['localhost', '127.0.0.1', '[::1]'].includes(requestHost))) {
        return next(invalid('Cross-site changes are not allowed.', 403));
      }
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));

  const storage = multer.diskStorage({
    destination: async (_request, _file, callback) => {
      try {
        await mkdir(uploadsDir, { recursive: true });
        callback(null, uploadsDir);
      } catch (error) { callback(error); }
    },
    filename: (_request, file, callback) => {
      const extension = file.fieldname === 'cover' ? imageTypes.get(file.mimetype) : path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    },
  });
  const upload = multer({
    storage,
    limits: { files: 2, fileSize: 30 * 1024 * 1024, fields: 12, fieldSize: 8192 },
    fileFilter: (_request, file, callback) => {
      if (file.fieldname === 'cover' && !imageTypes.has(file.mimetype)) {
        return callback(invalid('Cover images must be PNG, JPEG, WebP, or GIF.'));
      }
      if (file.fieldname === 'file' && !fileExtensions.has(path.extname(file.originalname).toLowerCase())) {
        return callback(invalid('Upload a project archive, HTML file, application package, PDF, or source file.'));
      }
      callback(null, true);
    },
  }).fields([{ name: 'cover', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/config', (_request, response) => response.json({ canManage: true, requiresLogin: false, maxUploadBytes: 30 * 1024 * 1024, storage: 'local' }));
  app.get('/api/admin', (_request, response) => response.json({ authenticated: true }));
  app.get('/api/projects', async (_request, response) => response.json({ projects: await store.list() }));

  app.post('/api/projects', upload, async (request, response, next) => {
    const uploaded = Object.values(request.files || {}).flat();
    try {
      const body = request.body || {};
      const title = text(body.title, 'Title', 100, true);
      const type = text(body.type, 'Project type', 20, true);
      if (!['website', 'app'].includes(type)) throw invalid('Project type must be website or app.');
      const url = cleanUrl(body.url);
      const cover = request.files?.cover?.[0];
      const file = request.files?.file?.[0];
      if (!url && !file) throw invalid('Add a project URL or upload a project file.');
      if (cover) {
        if (cover.size > 10 * 1024 * 1024) throw invalid('Cover images must be 10 MB or smaller.');
        if (!imageMatches(await readFile(cover.path), cover.mimetype)) throw invalid('The cover file does not match its image format.');
      }
      const yearText = text(body.year === undefined ? String(new Date().getFullYear()) : String(body.year), 'Year', 4);
      const year = Number(yearText);
      if (!/^\d{4}$/.test(yearText) || year < 1900 || year > 2100) throw invalid('Year must be between 1900 and 2100.');
      if (body.featured !== undefined && ![true, false, 'true', 'false'].includes(body.featured)) throw invalid('Featured must be true or false.');
      const project = {
        id: randomUUID(), title, type, url,
        description: text(body.description, 'Description', 1000),
        category: text(body.category, 'Category', 40) || 'Creative',
        year, featured: body.featured === true || body.featured === 'true',
        createdAt: new Date().toISOString(),
        ...(cover ? { coverUrl: `/uploads/${cover.filename}` } : {}),
        ...(file ? { fileUrl: `/uploads/${file.filename}`, fileName: cleanFileName(file.originalname) } : {}),
      };
      await store.add(project);
      response.status(201).json({ project });
    } catch (error) {
      await Promise.all(uploaded.map((file) => unlink(file.path).catch(() => {})));
      next(error);
    }
  });

  app.delete('/api/projects/:id', async (request, response) => {
    const project = await store.remove(request.params.id);
    if (!project) throw invalid('Project not found.', 404);
    await Promise.all([project.coverUrl, project.fileUrl].filter(Boolean).map((url) => unlink(path.join(uploadsDir, path.basename(url))).catch(() => {})));
    response.json({ deleted: true });
  });

  app.get('/uploads/:filename', async (request, response) => {
    const { filename } = request.params;
    if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,6}$/.test(filename)) throw invalid('File not found.', 404);
    const projects = await store.list();
    const image = projects.find((project) => project.coverUrl === `/uploads/${filename}`);
    const project = image || projects.find((entry) => entry.fileUrl === `/uploads/${filename}`);
    if (!project) throw invalid('File not found.', 404);
    response.set('Content-Security-Policy', "default-src 'none'; sandbox");
    response.set('Cache-Control', 'public, max-age=86400');
    const location = path.join(uploadsDir, filename);
    if (image) response.sendFile(location);
    else response.download(location, project.fileName || filename);
  });

  app.use('/api', (_request, _response, next) => next(invalid('API endpoint not found.', 404)));
  app.use(express.static(distDir));
  app.get('/{*path}', (_request, response, next) => {
    response.sendFile(path.join(distDir, 'index.html'), (error) => {
      if (error) next(invalid('Frontend is not built yet. Run npm run dev, or npm run build followed by npm start.', 404));
    });
  });
  app.use((error, _request, response, _next) => {
    let status = error.status || 500;
    let message = status >= 500 ? 'Something went wrong while saving your projects. Please try again.' : error.message;
    if (error instanceof multer.MulterError) {
      status = 400;
      message = error.code === 'LIMIT_FILE_SIZE' ? 'Project files must be 30 MB or smaller.' : 'Upload one cover image and one project file at most.';
    }
    if (error.type === 'entity.parse.failed') { status = 400; message = 'Send valid JSON.'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'The request is too large.'; }
    if (status >= 500) console.error('TurboUniverse API error:', error.message);
    response.status(status).json({ error: message });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => console.log(`TurboUniverse server listening on http://${host}:${port}`));
}
