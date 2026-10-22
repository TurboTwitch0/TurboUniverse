import express from 'express';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import catalog from '../server/catalog.json' with { type: 'json' };
import { createBlobStore } from '../server/blob-store.mjs';

export const MAX_UPLOAD_BYTES = 4_000_000;
const imageTypes = new Map([['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/webp', '.webp'], ['image/gif', '.gif']]);
const fileExtensions = new Set(['.zip', '.html', '.htm', '.apk', '.aab', '.ipa', '.pdf', '.exe', '.msi', '.dmg', '.tar', '.gz', '.tgz', '.7z', '.rar', '.txt', '.json', '.js', '.css', '.wasm', '.jar']);
const invalid = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

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
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid('Project URLs must use http:// or https:// without login details.');
  return url.href;
}

function imageMatches(bytes, mime) {
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
  if (mime === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function validKey(request, key) {
  const supplied = request.get('authorization') || '';
  const expected = `Bearer ${key}`;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
}

export function createVercelApp({ blobToken = process.env.BLOB_READ_WRITE_TOKEN || '', adminKey = process.env.TURBO_ADMIN_KEY || '', store, blobSDK, initialProjects = catalog } = {}) {
  const app = express();
  const configured = Boolean(blobToken && adminKey);
  const projectStore = store || (blobToken ? createBlobStore({ token: blobToken, initialProjects, sdk: blobSDK }) : null);
  app.disable('x-powered-by');
  app.use((_request, response, next) => { response.set('X-Content-Type-Options', 'nosniff'); response.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/config', (_request, response) => response.json({ canManage: configured, requiresLogin: configured, maxUploadBytes: MAX_UPLOAD_BYTES, storage: blobToken ? 'blob' : 'catalog' }));
  app.get('/api/admin', (request, response) => {
    if (!configured || !validKey(request, adminKey)) return response.status(401).json({ error: 'Enter the owner access key to manage this collection.' });
    response.json({ authenticated: true });
  });
  app.get('/api/projects', async (_request, response) => response.json({ projects: projectStore ? await projectStore.list() : initialProjects }));

  function authorize(request, _response, next) {
    if (!configured) return next(invalid('This collection is published in viewing mode. Connect Blob storage and configure an owner key to enable changes.', 503));
    if (!validKey(request, adminKey)) return next(invalid('Owner access is required to change this collection.', 401));
    const origin = request.get('origin');
    if (origin) {
      let parsed;
      try { parsed = new URL(origin); } catch { return next(invalid('Unrecognized request origin.', 403)); }
      // Vercel preserves the public Host header. An arbitrary forwarded header is
      // deliberately not used to authorize an unrelated browser origin.
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== request.get('host')) return next(invalid('Cross-site changes are not allowed.', 403));
    }
    const size = Number(request.get('content-length'));
    if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES + 100_000) return next(invalid('The complete upload must be 4 MB or smaller.', 413));
    next();
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 2, fileSize: MAX_UPLOAD_BYTES, fields: 12, fieldSize: 8192 },
    fileFilter: (_request, file, callback) => {
      if (file.fieldname === 'cover' && !imageTypes.has(file.mimetype)) return callback(invalid('Cover images must be PNG, JPEG, WebP, or GIF.'));
      if (file.fieldname === 'file' && !fileExtensions.has(path.extname(file.originalname).toLowerCase())) return callback(invalid('Upload a project archive, HTML file, application package, PDF, or source file.'));
      callback(null, true);
    },
  }).fields([{ name: 'cover', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

  app.post('/api/projects', authorize, express.json({ limit: '128kb' }), upload, async (request, response, next) => {
    const uploaded = [];
    try {
      const files = Object.values(request.files || {}).flat();
      if (files.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_BYTES) throw invalid('The cover and project file together must be 4 MB or smaller.', 413);
      const body = request.body || {};
      const title = text(body.title, 'Title', 100, true);
      const type = text(body.type, 'Project type', 20, true);
      if (!['website', 'app'].includes(type)) throw invalid('Project type must be website or app.');
      const url = cleanUrl(body.url);
      const cover = request.files?.cover?.[0];
      const file = request.files?.file?.[0];
      if (!url && !file) throw invalid('Add a project URL or upload a project file.');
      if (cover && !imageMatches(cover.buffer, cover.mimetype)) throw invalid('The cover file does not match its image format.');
      const yearText = String(body.year ?? new Date().getFullYear());
      const year = Number(yearText);
      if (!/^\d{4}$/.test(yearText) || year < 1900 || year > 2100) throw invalid('Year must be between 1900 and 2100.');
      if (body.featured !== undefined && ![true, false, 'true', 'false'].includes(body.featured)) throw invalid('Featured must be true or false.');
      const project = { id: randomUUID(), title, type, url, description: text(body.description, 'Description', 1000), category: text(body.category, 'Category', 40) || 'Creative', year, featured: body.featured === true || body.featured === 'true', createdAt: new Date().toISOString() };
      for (const entry of [cover, file].filter(Boolean)) {
        const extension = entry === cover ? imageTypes.get(entry.mimetype) : path.extname(entry.originalname).toLowerCase();
        const filename = `${randomUUID()}${extension}`;
        await projectStore.uploadAsset(filename, entry.buffer, entry === cover ? entry.mimetype : 'application/octet-stream');
        uploaded.push(filename);
        if (entry === cover) project.coverUrl = `/uploads/${filename}`;
        else {
          project.fileUrl = `/uploads/${filename}`;
          project.fileName = path.basename(entry.originalname.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'project-file';
        }
      }
      await projectStore.add(project);
      response.status(201).json({ project });
    } catch (error) {
      await Promise.all(uploaded.map(filename => projectStore.deleteAsset(filename).catch(() => {})));
      next(error);
    }
  });
  app.delete('/api/projects/:id', authorize, async (request, response) => {
    const project = await projectStore.remove(request.params.id);
    if (!project) throw invalid('Project not found.', 404);
    await Promise.all([project.coverUrl, project.fileUrl].filter(Boolean).map(url => projectStore.deleteAsset(path.basename(url)).catch(() => {})));
    response.json({ deleted: true });
  });
  app.get('/uploads/:filename', async (request, response) => {
    const { filename } = request.params;
    if (!projectStore || !/^[0-9a-f-]{36}\.[a-z0-9]{1,6}$/.test(filename)) throw invalid('File not found.', 404);
    const projects = await projectStore.list();
    const cover = projects.find(project => project.coverUrl === `/uploads/${filename}`);
    const project = cover || projects.find(entry => entry.fileUrl === `/uploads/${filename}`);
    if (!project) throw invalid('File not found.', 404);
    const bytes = await projectStore.readAsset(filename);
    if (!bytes) throw invalid('File not found.', 404);
    response.set('Content-Security-Policy', "default-src 'none'; sandbox");
    if (cover) response.type(path.extname(filename));
    else { response.type('application/octet-stream'); response.attachment(project.fileName || filename); }
    response.send(bytes);
  });
  app.use((_request, _response, next) => next(invalid('API endpoint not found.', 404)));
  app.use((error, _request, response, _next) => {
    let status = error.expose ? error.status : 500;
    let message = error.expose ? error.message : 'The collection could not be loaded or saved. Please try again.';
    if (error instanceof multer.MulterError) { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; message = error.code === 'LIMIT_FILE_SIZE' ? 'Uploads must be 4 MB or smaller.' : 'Upload one cover image and one project file at most.'; }
    if (error.type === 'entity.parse.failed') { status = 400; message = 'Send valid JSON.'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'The request is too large.'; }
    response.status(status).json({ error: message });
  });
  return app;
}

export default createVercelApp();
