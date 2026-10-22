import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createStore(dataDir, initialProjects = []) {
  const filename = path.join(dataDir, 'projects.json');
  let queue = Promise.resolve();
  let initialization;

  function initialize() {
    if (!initialization) initialization = (async () => {
      await mkdir(dataDir, { recursive: true });
      try {
        await writeFile(filename, JSON.stringify(initialProjects, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    })();
    return initialization;
  }

  async function read() {
    await initialize();
    const contents = JSON.parse(await readFile(filename, 'utf8'));
    if (!Array.isArray(contents)) throw new Error('Project storage is invalid.');
    return contents;
  }

  function update(change) {
    const operation = queue.then(async () => {
      const projects = await read();
      const result = change(projects);
      await mkdir(dataDir, { recursive: true });
      const temporary = `${filename}.tmp`;
      await writeFile(temporary, JSON.stringify(projects, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, filename);
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }

  return {
    list: read,
    add: (project) => update((projects) => {
      projects.unshift(project);
      return project;
    }),
    remove: (id) => update((projects) => {
      const index = projects.findIndex((project) => project.id === id);
      return index < 0 ? null : projects.splice(index, 1)[0];
    }),
  };
}
