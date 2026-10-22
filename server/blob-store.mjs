const PREFIX = 'turbo-universe/';

function recordPath(id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid project identifier.');
  return `${PREFIX}projects/${id}.json`;
}

function assetPath(filename) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,6}$/.test(filename)) throw new Error('Invalid upload filename.');
  return `${PREFIX}assets/${filename}`;
}

async function readBytes(result) {
  if (!result || result.statusCode === 404) return null;
  if (result.statusCode && result.statusCode !== 200) throw new Error('Blob storage returned an unexpected response.');
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/** A separate immutable ID per project prevents unrelated serverless writes from
 * overwriting one shared catalog. Tombstones retain deletion of starter entries.
 */
export function createBlobStore({ token, initialProjects = [], sdk } = {}) {
  if (!token) throw new Error('Blob storage is not configured.');
  const client = sdk ? Promise.resolve(sdk) : import('@vercel/blob');
  const readOptions = { token, access: 'private', useCache: false };
  const writeOptions = { token, access: 'private', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };

  async function read(pathname) {
    return readBytes(await (await client).get(pathname, readOptions));
  }

  async function list() {
    const merged = new Map(initialProjects.map(project => [project.id, { ...project }]));
    const records = [];
    let cursor;
    do {
      const page = await (await client).list({ token, prefix: `${PREFIX}projects/`, limit: 1000, ...(cursor ? { cursor } : {}) });
      records.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
      if (page.hasMore && !cursor) throw new Error('Blob storage returned an incomplete catalog.');
    } while (cursor);
    // Limit parallel requests for large collections while preserving pagination.
    for (let offset = 0; offset < records.length; offset += 12) {
      const changes = await Promise.all(records.slice(offset, offset + 12).map(async entry => {
        const bytes = await read(entry.pathname);
        return bytes ? JSON.parse(bytes.toString('utf8')) : null;
      }));
      for (const change of changes) {
        if (!change) continue;
        if (change.deleted && typeof change.id === 'string') merged.delete(change.id);
        else if (change.project?.id) merged.set(change.project.id, change.project);
        else throw new Error('Blob storage contains an invalid project record.');
      }
    }
    return [...merged.values()].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function saveRecord(id, record) {
    await (await client).put(recordPath(id), JSON.stringify(record), { ...writeOptions, contentType: 'application/json' });
  }

  return {
    list,
    async add(project) { await saveRecord(project.id, { project }); return project; },
    async remove(id) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
      const project = (await list()).find(entry => entry.id === id);
      if (!project) return null;
      await saveRecord(id, { id, deleted: true });
      return project;
    },
    async uploadAsset(filename, bytes, contentType) {
      await (await client).put(assetPath(filename), bytes, { ...writeOptions, allowOverwrite: false, contentType });
    },
    async readAsset(filename) { return read(assetPath(filename)); },
    async deleteAsset(filename) { await (await client).del(assetPath(filename), { token }); },
  };
}
