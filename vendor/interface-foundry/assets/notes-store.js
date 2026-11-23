/** Small synchronous notes model. Pass localStorage explicitly; no browser globals are required. */
export const STORAGE_KEY = 'interface-foundry-notes-v1';
export const MAX_NOTES = 100;
export const DEFAULT_NOTES = Object.freeze([
  Object.freeze({ id: 'note-room', kind: 'note', title: 'Make room for the useful.', body: 'A quieter interface helps the important things come forward.' }),
  Object.freeze({ id: 'decision-task', kind: 'decision', title: 'Start with the main task.', body: 'Every screen should make the next useful action clear.' }),
  Object.freeze({ id: 'note-details', kind: 'note', title: 'Details are the experience.', body: 'Focus states, empty screens, and a button that does what it says.' })
]);

let idSequence = 0;
const clone = note => ({ id: note.id, kind: note.kind, title: note.title, body: note.body });
const defaults = () => DEFAULT_NOTES.map(clone);

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain object.`);
}

function fields(value) {
  record(value, 'Note');
  if (value.kind !== 'note' && value.kind !== 'decision') throw new TypeError('Kind must be note or decision.');
  if (typeof value.title !== 'string') throw new TypeError('Title must be a string.');
  const title = value.title.trim();
  if (title.length < 1 || title.length > 100) throw new RangeError('Title must contain 1–100 characters.');
  const body = value.body;
  if (typeof body !== 'string') throw new TypeError('Body must be a string.');
  if (body.length > 2000) throw new RangeError('Body must contain at most 2000 characters.');
  return { kind: value.kind, title, body };
}

function validateId(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new TypeError('Note ID must be a nonempty string of at most 128 characters.');
  return id;
}

function restored(value) {
  record(value, 'Note');
  return { id: validateId(value.id), ...fields(value) };
}

function load(value) {
  const parsed = JSON.parse(value);
  record(parsed, 'Saved collection');
  if (parsed.version !== 1 || !Array.isArray(parsed.notes) || parsed.notes.length > MAX_NOTES) throw new Error('Unsupported saved collection.');
  const notes = parsed.notes.map(restored);
  if (new Set(notes.map(note => note.id)).size !== notes.length) throw new Error('Saved collection has duplicate IDs.');
  return notes;
}

function uniqueId(notes) {
  let id;
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') id = `entry-${globalThis.crypto.randomUUID()}`;
  } catch { /* A restricted runtime can still use the local fallback. */ }
  if (!id || notes.some(note => note.id === id)) {
    do { id = `entry-${Date.now().toString(36)}-${(++idSequence).toString(36)}`; }
    while (notes.some(note => note.id === id));
  }
  return id;
}

export function createNotesStore(storage) {
  let notes = defaults();
  let persistent = false;
  let lastSaveSucceeded = false;
  let canWrite = false;
  let damagedCollection = false;
  let confirmedRaw;
  let storageConflict = false;

  // A failed read must not overwrite an inaccessible, possibly valid collection.
  if (storage !== undefined && storage !== null) {
    try {
      if (typeof storage.getItem !== 'function') throw new TypeError('Storage has no getItem method.');
      const saved = storage.getItem(STORAGE_KEY);
      confirmedRaw = saved;
      canWrite = true;
      if (saved !== null && saved !== undefined) {
        try { notes = load(saved); } catch {
          // Keep the original bytes available for recovery until an explicit reset.
          notes = defaults();
          damagedCollection = true;
        }
      }
    } catch { canWrite = false; }
  }

  function save() {
    persistent = false;
    lastSaveSucceeded = false;
    if (!canWrite || damagedCollection || storageConflict) return;
    try {
      // Detect a newer snapshot before replacing it. localStorage has no atomic
      // compare-and-set: this is a conservative stale-write check, not a lock.
      if (storage.getItem(STORAGE_KEY) !== confirmedRaw) {
        storageConflict = true;
        return;
      }
      const encoded = JSON.stringify({ version: 1, notes });
      storage.setItem(STORAGE_KEY, encoded);
      confirmedRaw = encoded;
      persistent = true;
      lastSaveSucceeded = true;
    } catch { /* Keep the current in-memory collection even if persistence fails. */ }
  }

  function indexOf(id) {
    validateId(id);
    const index = notes.findIndex(note => note.id === id);
    if (index < 0) throw new Error('This entry no longer exists.');
    return index;
  }

  function checkCapacity() {
    if (notes.length >= MAX_NOTES) throw new RangeError(`Your workspace can hold up to ${MAX_NOTES} entries. Delete an entry before adding another.`);
  }

  const store = {
    get persistent() { return persistent; },
    get lastSaveSucceeded() { return lastSaveSucceeded; },
    get damagedCollection() { return damagedCollection; },
    get storageConflict() { return storageConflict; },
    list() { return notes.map(clone); },
    create(value) {
      const content = fields(value);
      checkCapacity();
      const note = { id: uniqueId(notes), ...content };
      notes = [note, ...notes];
      save();
      return clone(note);
    },
    update(id, changes) {
      const index = indexOf(id);
      record(changes, 'Changes');
      for (const key of Object.keys(changes)) if (!['kind', 'title', 'body'].includes(key)) throw new TypeError(`Cannot update ${key}.`);
      const candidate = { ...notes[index], ...changes };
      // Explicit undefined is invalid for an update; omitted fields stay unchanged.
      for (const key of Object.keys(changes)) if (changes[key] === undefined) throw new TypeError(`${key} must be a string.`);
      const note = { id, ...fields(candidate) };
      notes = notes.map((current, position) => position === index ? note : current);
      save();
      return clone(note);
    },
    remove(id) {
      const index = indexOf(id);
      const note = notes[index];
      notes = notes.filter((_, position) => position !== index);
      save();
      return clone(note);
    },
    restore(value, index = notes.length) {
      const note = restored(value);
      if (notes.some(current => current.id === note.id)) throw new Error('An entry with this ID already exists.');
      if (!Number.isInteger(index) || index < 0 || index > notes.length) throw new RangeError('Restore position must be within the collection.');
      checkCapacity();
      notes = [...notes.slice(0, index), note, ...notes.slice(index)];
      save();
      return clone(note);
    },
    reset() {
      notes = defaults();
      damagedCollection = false;
      save();
      return notes.map(clone);
    },
    search(query, kind = 'all') {
      if (typeof query !== 'string') throw new TypeError('Search query must be a string.');
      if (!['all', 'note', 'decision'].includes(kind)) throw new TypeError('Filter must be all, note, or decision.');
      const needle = query.trim().toLowerCase();
      return notes.filter(note => (kind === 'all' || note.kind === kind) && `${note.title}\n${note.body}`.toLowerCase().includes(needle)).map(clone);
    }
  };
  save();
  return Object.freeze(store);
}
