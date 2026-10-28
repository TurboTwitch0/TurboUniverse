import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ROOT_FILES = new Set([
  'index.html', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'package.json',
  'package-lock.json', '.gitignore', '.nvmrc', 'netlify.toml', 'vercel.json',
  'CHANGELOG.md', 'SECURITY.md', 'DEPLOYMENT.md'
]);
const SOURCE_DIRECTORIES = new Set(['assets', 'bin', 'lib', 'scripts', 'skills', 'test', 'examples', 'docs', '.github']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', 'downloads', 'vendor', '.git', '.openai']);
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

// Source packages deliberately omit credential-like files even inside allowed dirs.
function isSafeName(name) {
  if (name.startsWith('.')) return false;
  if (/\.(?:zip|tgz|tar|gz|7z|pem|key|p12|pfx|keystore)$/i.test(name)) return false;
  if (/(?:^|[._-])(?:env|secrets?|credentials?|tokens?|id_rsa|id_ed25519)(?:[._-]|$)/i.test(name)) return false;
  return !name.includes('\\') && !name.includes('\0');
}

export async function sourceEntries(root) {
  const entries = [];
  let total = 0;
  async function collect(relative) {
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const item of (await readdir(absolute)).sort()) {
        if (!isSafeName(item) || EXCLUDED_DIRECTORIES.has(item)) continue;
        await collect(path.join(relative, item));
      }
    } else if (stat.isFile()) {
      if (stat.size > MAX_FILE_BYTES || total + stat.size > MAX_SOURCE_BYTES) throw new Error(`Source archive exceeds its size budget: ${relative}`);
      const data = await readFile(absolute);
      total += data.length;
      entries.push({ name: `interface-foundry/${relative.split(path.sep).join('/')}`, data, executable: relative.startsWith(`bin${path.sep}`) });
    }
  }
  for (const name of (await readdir(root)).sort()) {
    if (ROOT_FILES.has(name) || SOURCE_DIRECTORIES.has(name)) await collect(name);
  }
  return entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// A standard UTF-8 ZIP archive with deflate compression and fixed timestamps.
// It needs neither a platform zip executable nor an npm package.
export function createZip(entries) {
  if (entries.length > 65535) throw new Error('Too many source archive entries.');
  const chunks = [];
  const central = [];
  const seen = new Set();
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.split('/').some(part => !part || part === '..' || part === '.') || /[\\\0]/.test(entry.name)) throw new Error(`Unsafe archive path: ${entry.name}`);
    if (seen.has(entry.name)) throw new Error(`Duplicate archive path: ${entry.name}`);
    seen.add(entry.name);
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(data, { level: 9 });
    if (name.length > 65535 || data.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) throw new Error('Source archive requires unsupported ZIP64 sizes.');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // 1980-01-01 in DOS date format.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE((3 << 8) | 20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(33, 14);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((entry.executable ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  if (offset + directory.length > 0xffffffff) throw new Error('Source archive requires unsupported ZIP64 sizes.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

export async function createSourceArchive(root) {
  return createZip(await sourceEntries(root));
}
