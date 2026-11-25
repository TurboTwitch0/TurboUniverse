import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORAGE_KEY } from '../assets/notes-store.js';

// This small DOM fixture executes the actual browser module without a browser.
// It covers event/state wiring; it makes no layout or browser-accessibility claim.
class FixtureNode {
  constructor(ownerDocument, tagName = '', text = '') {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.nodeType = tagName ? 1 : 3;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this._text = text;
    this.value = '';
    this.open = false;
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`) ?? undefined,
      set: (_, key, value) => { this.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true; }
    });
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const add = force ?? !this.classList.contains(name);
        if (add) this.classList.add(name); else this.classList.remove(name);
        return add;
      }
    };
  }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(value) { this.setAttribute('class', value); }
  get hidden() { return this.attributes.has('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get disabled() { return this.attributes.has('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { for (const child of this.children) child.parentElement = null; this._text = String(value); this.children = []; }
  get firstElementChild() { return this.children.find(child => child.nodeType === 1) ?? null; }
  get parentNode() { return this.parentElement; }
  get isConnected() { let node = this; while (node.parentElement) node = node.parentElement; return node === this.ownerDocument._root; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'value') this.value = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === 'string') node = this.ownerDocument.createTextNode(node);
      node.remove(); node.parentElement = this; this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      node.remove(); node.parentElement = this; this.children.unshift(node);
    }
  }
  replaceChildren(...nodes) { for (const child of this.children) child.parentElement = null; this.children = []; this._text = ''; this.append(...nodes); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    const attributes = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
    for (const [, name, value] of attributes) {
      if (!this.hasAttribute(name) || (value !== undefined && this.getAttribute(name) !== value)) return false;
    }
    const simple = selector.replace(/\[[^\]]+\]/g, '');
    const id = simple.match(/#([\w-]+)/)?.[1];
    if (id && this.id !== id) return false;
    for (const [, name] of simple.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
    const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
    return !tag || this.tagName === tag.toUpperCase();
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.nodeType === 1 && child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  emit(name, options = {}) {
    const event = { type: name, target: this, currentTarget: this, defaultPrevented: false, clientX: 30, clientY: 30, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...options };
    for (let node = this; node; node = name === 'close' ? null : node.parentElement) {
      event.currentTarget = node;
      for (const listener of node.listeners.get(name) ?? []) listener(event);
      if (event.stopped) break;
    }
    return event;
  }
  click() {
    if (this.disabled) return;
    if (this.tagName === 'A' && this.download) this.ownerDocument.downloads.push({ href: this.href, filename: this.download });
    this.emit('click');
  }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; this.focus(); }
  close() { this.open = false; queueMicrotask(() => this.emit('close')); }
  getBoundingClientRect() { return { left: 20, top: 20, right: 820, bottom: 620, width: 800, height: 600 }; }
  reset() { for (const field of this.querySelectorAll('input, textarea, select')) field.value = field.getAttribute('value') ?? (field.tagName === 'SELECT' ? field.querySelector('option')?.value ?? '' : ''); }
  reportValidity() { return this.checkValidity(); }
  checkValidity() { return this.querySelectorAll('[required]').every(field => field.value.trim()); }
}

function fixtureDocument(html) {
  const document = { downloads: [], activeElement: null, createElement(tag) { return new FixtureNode(this, tag); }, createTextNode(text) { return new FixtureNode(this, '', text); } };
  const root = document.createElement('root');
  document._root = root;
  const stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const decode = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)) {
    const part = token[0];
    if (part.startsWith('<!')) continue;
    if (part.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (part.startsWith('<')) {
      const tag = part.match(/^<([\w-]+)/)[1].toLowerCase();
      const node = document.createElement(tag);
      const attributes = part.slice(tag.length + 1).replace(/\/?\s*>$/, '');
      for (const attribute of attributes.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) node.setAttribute(attribute[1], decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? ''));
      stack.at(-1).append(node);
      if (!voidTags.has(tag) && !part.endsWith('/>')) stack.push(node);
    } else stack.at(-1).append(document.createTextNode(decode(part)));
  }
  document.querySelector = selector => root.querySelector(selector);
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  document.body = document.querySelector('body');
  document.documentElement = document.querySelector('html');
  document.createDocumentFragment = () => document.createElement('fragment');
  document.addEventListener = (...args) => root.addEventListener(...args);
  return document;
}

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
let instance = 0;

async function loadApp({ storage = memoryStorage(), fetch: fetchStub = async () => ({ ok: true, json: async () => Object.fromEntries(['direction', 'audit', 'reference', 'reconstruct', 'verify'].map(name => [name, `# Complete ${name} skill`])) }) } = {}) {
  const document = fixtureDocument(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  const blobs = new Map();
  const copied = [];
  const listeners = new Map();
  const window = {
    localStorage: storage, isSecureContext: true,
    addEventListener(name, handler) { listeners.set(name, handler); },
    getSelection() { return { removeAllRanges() {}, addRange() {} }; },
    confirm() { return true; },
    reloads: 0, location: { reload() { window.reloads++; } }
  };
  const replacements = {
    document, window, localStorage: storage, navigator: { clipboard: { writeText: async text => copied.push(text) } },
    fetch: fetchStub, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: callback => callback(),
    HTMLInputElement: FixtureNode, HTMLElement: FixtureNode,
    URL: class extends URL {
      static createObjectURL(blob) { const url = `blob:fixture-${blobs.size}`; blobs.set(url, blob); return url; }
      static revokeObjectURL() {}
    }
  };
  const previous = new Map();
  for (const [name, value] of Object.entries(replacements)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  };
  try {
    await import(new URL(`../assets/app.js?fixture=${++instance}`, import.meta.url));
    await settle();
  } catch (error) { dispose(); throw error; }
  return { document, window, storage, copied, blobs, dispose, get: selector => document.querySelector(selector), all: selector => document.querySelectorAll(selector) };
}

test('workflow keyboard navigation, visual directions, and agent install controls remain connected', async t => {
  const app = await loadApp();
  t.after(app.dispose);
  assert.equal(app.get('script[src="assets/app.js"]').getAttribute('type'), 'module', 'the page must load the module that imports the notes store');
  const keyboard = app.get('#tab-direction').emit('keydown', { key: 'ArrowDown' });
  assert.equal(keyboard.defaultPrevented, true);
  assert.equal(app.get('#tab-audit').getAttribute('aria-selected'), 'true');
  assert.equal(app.get('#tab-direction').getAttribute('aria-selected'), 'false');
  assert.equal(app.document.activeElement, app.get('#tab-audit'));
  assert.equal(app.get('#workflow-panel').getAttribute('aria-labelledby'), 'tab-audit');
  assert.match(app.get('#workflow-prompt').textContent, /foundry-audit/);
  app.get('#copy-prompt').click();
  await settle();
  assert.match(app.copied.at(-1), /foundry-audit/);
  app.get('#direction-editorial').emit('keydown', { key: 'End' });
  assert.equal(app.get('#design-preview').dataset.theme, 'terminal');
  assert.equal(app.get('#direction-terminal').getAttribute('aria-selected'), 'true');
  app.get('[data-art-theme-option="ink"]').click();
  assert.equal(app.get('#hero-stage').dataset.artTheme, 'ink');
  app.get('[data-agent="codex"]').click();
  assert.match(app.get('#install-command').textContent, /--agent codex/);
  assert.match(app.get('#install-target').textContent, /\.agents/);
});

test('a delayed skill fetch cannot replace a reopened dialog with the older workflow', async t => {
  let complete;
  let requests = 0;
  const response = new Promise(resolve => { complete = resolve; });
  const app = await loadApp({ fetch: () => { requests++; return response; } });
  t.after(app.dispose);
  app.get('#skill-source').click();
  assert.equal(app.get('#skill-dialog').open, true);
  assert.equal(app.get('#copy-skill').disabled, true);
  app.get('#close-skill').click();
  app.get('#tab-audit').click();
  app.get('#skill-source').click();
  complete({ ok: true, json: async () => Object.fromEntries(['direction', 'audit', 'reference', 'reconstruct', 'verify'].map(name => [name, `# Complete ${name} skill`])) });
  await settle();
  assert.equal(requests, 1, 'reopening shares the in-flight skill request');
  assert.equal(app.get('#skill-dialog').open, true);
  assert.equal(app.get('#skill-content').textContent, '# Complete audit skill');
  assert.equal(app.get('#copy-skill').disabled, false);
  app.get('#skill-dialog').emit('click', { clientX: 100, clientY: 100 });
  assert.equal(app.get('#skill-dialog').open, true, 'dialog padding click is not a backdrop click');
  app.get('#skill-dialog').emit('click', { clientX: 5, clientY: 5 });
  assert.equal(app.get('#skill-dialog').open, false);
  await settle();
  assert.equal(app.document.activeElement, app.get('#skill-source'));
});

test('failed skill loading offers retry and successful downloads contain the displayed Markdown', async t => {
  let requests = 0;
  const app = await loadApp({ fetch: async () => {
    if (++requests === 1) throw new Error('offline');
    return { ok: true, json: async () => Object.fromEntries(['direction', 'audit', 'reference', 'reconstruct', 'verify'].map(name => [name, `# Complete ${name} skill`])) };
  } });
  t.after(app.dispose);
  app.get('#skill-source').click();
  await settle();
  assert.equal(app.get('#retry-skill').hidden, false);
  assert.equal(app.get('#download-skill').disabled, true);
  assert.match(app.get('#skill-feedback').textContent, /unable|could not|retry/i);
  app.get('#retry-skill').click();
  await settle();
  assert.equal(requests, 2);
  assert.equal(app.get('#retry-skill').hidden, true);
  assert.equal(app.get('#download-skill').disabled, false);
  app.get('#download-skill').click();
  const download = app.document.downloads.at(-1);
  assert.equal(download.filename, 'SKILL.md');
  assert.equal(await app.blobs.get(download.href).text(), app.get('#skill-content').textContent);
});

test('a note can be created, edited, found after reload, deleted, restored, and exported', async t => {
  const storage = memoryStorage();
  let app = await loadApp({ storage });
  t.after(() => app.dispose());
  assert.equal(app.all('.note-card').length, 3);
  app.get('#new-note').click();
  assert.equal(app.get('#note-dialog').open, true);
  assert.equal(app.document.activeElement, app.get('#note-title'));
  app.get('#note-title').value = '   ';
  app.get('#note-form').emit('submit');
  assert.match(app.get('#note-error').textContent, /title/i);
  assert.equal(app.get('#note-dialog').open, true);
  assert.equal(app.all('.note-card').length, 3);

  app.get('#note-title').value = 'Map the control surface';
  app.get('#note-kind').value = 'decision';
  app.get('#note-body').value = 'trace-lantern-42: <script>plain text, not markup</script>';
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(app.get('#note-dialog').open, false);
  assert.equal(app.all('.note-card').length, 4);
  const created = app.all('.note-card').find(card => card.textContent.includes('Map the control surface'));
  const id = created.dataset.noteId;
  assert.equal(created.querySelector('script'), null);
  assert.match(created.textContent, /<script>plain text, not markup<\/script>/);

  app.get('#note-search').value = 'LANTERN-42';
  app.get('#note-search').emit('input');
  assert.equal(app.all('.note-card').length, 1);
  app.get('[data-filter="note"]').click();
  assert.equal(app.all('.note-card').length, 0);
  assert.equal(app.get('#empty-notes').hidden, false);
  app.get('[data-filter="decision"]').click();
  assert.equal(app.all('.note-card').length, 1);
  app.get('.note-open').click();
  assert.equal(app.get('#note-title').value, 'Map the control surface');
  app.get('#note-title').value = 'A durable interface decision';
  app.get('#note-kind').value = 'note';
  app.get('#note-body').value = 'Keep the primary path clear.';
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(app.get('#note-search').value, '');
  assert.equal(app.get('[data-filter="all"]').getAttribute('aria-pressed'), 'true');
  assert.equal(app.all('.note-card').length, 4);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes.find(note => note.id === id).title, 'A durable interface decision');

  app.dispose();
  app = await loadApp({ storage });
  const reopened = app.all('.note-card').find(card => card.dataset.noteId === id);
  assert.ok(reopened, 'a fresh application instance restores the saved entry');
  reopened.querySelector('.note-open').click();
  assert.equal(app.get('#note-body').value, 'Keep the primary path clear.');
  app.get('#delete-note').click();
  await settle();
  assert.equal(app.all('.note-card').length, 3);
  assert.equal(app.get('#note-undo').hidden, false);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes.some(note => note.id === id), false);
  app.get('#undo-delete').click();
  assert.equal(app.all('.note-card').length, 4);
  assert.equal(app.get('#note-undo').hidden, true);
  assert.equal(app.document.activeElement.closest('.note-card').dataset.noteId, id);

  app.get('#export-notes').click();
  const download = app.document.downloads.at(-1);
  assert.equal(download.filename, 'interface-foundry-notes.json');
  const blob = app.blobs.get(download.href);
  assert.equal(blob.type, 'application/json');
  const exported = JSON.parse(await blob.text());
  assert.equal(exported.version, 1);
  assert.equal(exported.notes.length, 4);
  assert.deepEqual(exported.notes.find(note => note.id === id), { id, title: 'A durable interface decision', kind: 'note', body: 'Keep the primary path clear.' });
  assert.ok(Number.isFinite(Date.parse(exported.exportedAt)));
});

test('leaving a changed note requires an explicit discard and keeps drafts intact until then', async t => {
  const app = await loadApp();
  t.after(app.dispose);
  const editor = app.get('#note-dialog');
  const title = app.get('#note-title');
  const body = app.get('#note-body');
  const confirmation = app.get('#note-discard-confirmation');
  const keepEditing = app.get('#keep-editing-note');

  app.get('#new-note').click();
  editor.emit('cancel');
  await settle();
  assert.equal(editor.open, false, 'a clean editor still closes on Escape');
  assert.equal(confirmation.hidden, true);

  app.get('#new-note').click();
  title.value = 'Unfinished layout idea';
  body.value = 'Keep this text until I decide.';
  for (const dismiss of [
    () => editor.emit('cancel'),
    () => editor.emit('click', { clientX: 2, clientY: 2 }),
    () => app.get('#close-note').click(),
    () => app.get('#cancel-note').click()
  ]) {
    dismiss();
    assert.equal(editor.open, true);
    assert.equal(confirmation.hidden, false);
    assert.equal(app.document.activeElement, keepEditing);
    keepEditing.click();
    assert.equal(confirmation.hidden, true);
    assert.equal(title.value, 'Unfinished layout idea');
    assert.equal(body.value, 'Keep this text until I decide.');
  }
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(editor.open, false, 'saving closes without a discard prompt');
  assert.equal(app.all('.note-card').length, 4);
  app.get('.note-open').click();
  app.get('#note-kind').value = 'decision';
  const escape = () => editor.emit('keydown', { key: 'Escape' });
  assert.equal(escape().defaultPrevented, true);
  editor.emit('keydown', { key: 'Escape', repeat: true });
  assert.equal(confirmation.hidden, false, 'holding Escape keeps the discard choice visible');
  assert.equal(escape().defaultPrevented, true);
  assert.equal(editor.open, true, 'Escape on the confirmation returns to the draft');
  assert.equal(confirmation.hidden, true);
  escape();
  app.get('#discard-note').click();
  await settle();
  assert.equal(editor.open, false);
  assert.equal(JSON.parse(app.storage.getItem(STORAGE_KEY)).notes[0].kind, 'note');
  assert.equal(app.document.activeElement, app.get('.note-open'));
});

test('storage failure keeps notes usable and exportable, then a later successful save updates status', async t => {
  const saved = memoryStorage();
  let blocked = true;
  const storage = { getItem: key => saved.getItem(key), setItem(key, value) { if (blocked) throw new Error('quota exceeded'); saved.setItem(key, value); } };
  const app = await loadApp({ storage });
  t.after(app.dispose);
  assert.match(app.get('#workspace-status').textContent, /temporary|unavailable/i);
  app.get('#new-note').click();
  app.get('#note-title').value = 'A recoverable offline thought';
  app.get('#note-body').value = 'Export keeps this thought available without storage.';
  app.get('#note-kind').value = 'note';
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(app.all('.note-card').length, 4);
  assert.equal(saved.getItem(STORAGE_KEY), null);
  assert.match(app.get('#workspace-status').textContent, /temporary|unavailable/i);
  app.get('#export-notes').click();
  const download = app.document.downloads.at(-1);
  const exported = JSON.parse(await app.blobs.get(download.href).text());
  assert.ok(exported.notes.some(note => note.title === 'A recoverable offline thought'));

  blocked = false;
  app.all('.note-card').find(card => card.textContent.includes('A recoverable offline thought')).querySelector('.note-open').click();
  app.get('#note-body').value = 'Storage is available again.';
  app.get('#note-form').emit('submit');
  await settle();
  assert.match(app.get('#workspace-status').textContent, /saved in this browser/i);
  assert.equal(JSON.parse(saved.getItem(STORAGE_KEY)).notes.length, 4);
});

test('damaged saved notes remain recoverable while temporary notes can be exported', async t => {
  const storage = memoryStorage();
  const original = '{"version":2,"notes":[{"title":"Recover me"}]}';
  storage.setItem(STORAGE_KEY, original);
  const app = await loadApp({ storage });
  t.after(app.dispose);
  assert.match(app.get('#workspace-status').textContent, /original data is preserved/i);
  app.get('#new-note').click();
  app.get('#note-title').value = 'Temporary recovery note';
  app.get('#note-kind').value = 'note';
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(storage.getItem(STORAGE_KEY), original);
  app.get('#export-notes').click();
  const exported = JSON.parse(await app.blobs.get(app.document.downloads.at(-1).href).text());
  assert.ok(exported.notes.some(note => note.title === 'Temporary recovery note'));
  app.get('#reset-notes').click();
  assert.equal(storage.getItem(STORAGE_KEY), original);
  app.get('#reset-notes').click();
  assert.match(app.get('#workspace-status').textContent, /saved in this browser/i);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes.length, 3);
});

test('empty collections, unmatched searches, and reset confirmation have distinct safe outcomes', async t => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes: [] }));
  const app = await loadApp({ storage });
  t.after(app.dispose);
  assert.equal(app.all('.note-card').length, 0);
  assert.equal(app.get('#empty-notes').hidden, false);
  assert.match(app.get('#empty-notes').textContent, /blank|create/i);
  app.get('#new-note').click();
  app.get('#note-title').value = 'The first thought';
  app.get('#note-body').value = 'A real entry in an empty collection.';
  app.get('#note-kind').value = 'note';
  app.get('#note-form').emit('submit');
  await settle();
  app.get('#note-search').value = 'this phrase does not exist';
  app.get('#note-search').emit('input');
  assert.equal(app.all('.note-card').length, 0);
  assert.match(app.get('#empty-notes').textContent, /no entries match/i);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes.length, 1, 'searching does not remove saved entries');

  app.get('#reset-notes').click();
  assert.match(app.get('#reset-notes').textContent, /confirm reset/i);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes.length, 1, 'the first reset click is a confirmation step');
  app.get('#note-search').value = '';
  app.get('#note-search').emit('input');
  assert.equal(app.get('#reset-notes').textContent, 'Reset demo', 'other actions cancel the pending reset');
  app.get('#reset-notes').click();
  app.get('#reset-notes').click();
  assert.equal(app.all('.note-card').length, 3);
  assert.equal(app.get('#empty-notes').hidden, true);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).notes.length, 3);
});

test('comparing basic and designed presentations keeps edited notes and choosing a theme restores the design', async t => {
  const app = await loadApp();
  t.after(app.dispose);
  const basic = app.get('[data-presentation-option="basic"]');
  const designed = app.get('[data-presentation-option="designed"]');
  assert.equal(app.get('#design-preview').dataset.presentation, 'designed');
  assert.equal(designed.getAttribute('aria-pressed'), 'true');
  const initial = JSON.parse(app.storage.getItem(STORAGE_KEY));
  basic.click();
  assert.equal(app.get('#design-preview').dataset.presentation, 'basic');
  assert.equal(basic.getAttribute('aria-pressed'), 'true');
  assert.equal(designed.getAttribute('aria-pressed'), 'false');
  assert.match(app.get('#comparison-description').textContent, /basic treatment/i);
  assert.deepEqual(JSON.parse(app.storage.getItem(STORAGE_KEY)), initial, 'comparison changes presentation rather than records');

  const id = app.get('.note-card').dataset.noteId;
  app.get('.note-open').click();
  app.get('#note-title').value = 'The same record, clearer choices';
  app.get('#note-body').value = 'Editing still works in the basic presentation.';
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(app.get('#design-preview').dataset.presentation, 'basic');
  const edited = JSON.parse(app.storage.getItem(STORAGE_KEY));
  app.get('#note-search').value = 'clearer choices';
  app.get('#note-search').emit('input');
  designed.click();
  assert.equal(app.get('#design-preview').dataset.presentation, 'designed');
  assert.equal(designed.getAttribute('aria-pressed'), 'true');
  assert.equal(app.get('#note-search').value, 'clearer choices');
  assert.equal(app.all('.note-card').length, 1);
  assert.equal(app.get('.note-card').dataset.noteId, id);
  assert.match(app.get('.note-card').textContent, /Editing still works in the basic presentation/);
  assert.deepEqual(JSON.parse(app.storage.getItem(STORAGE_KEY)), edited);

  basic.click();
  app.get('#direction-editorial').emit('keydown', { key: 'End' });
  assert.equal(app.get('#design-preview').dataset.theme, 'terminal');
  assert.equal(app.get('#direction-terminal').getAttribute('aria-selected'), 'true');
  assert.equal(app.get('#design-preview').dataset.presentation, 'designed', 'choosing a visual direction shows its designed treatment');
  assert.equal(basic.getAttribute('aria-pressed'), 'false');
  assert.equal(designed.getAttribute('aria-pressed'), 'true');
  assert.match(app.get('#comparison-description').textContent, /designed treatment: terminal/i);
  assert.deepEqual(JSON.parse(app.storage.getItem(STORAGE_KEY)), edited);
});

test('project context personalizes workflow prompts and invalid lengths keep the last copyable prompt', async t => {
  const app = await loadApp();
  t.after(app.dispose);
  const project = 'Atelier 雨 <em>notes</em>';
  const goal = 'Retrouver café ☕ & partager les idées';
  const projectInput = app.get('#prompt-project');
  const goalInput = app.get('#prompt-goal');
  assert.equal(projectInput.getAttribute('maxlength'), '80');
  assert.equal(goalInput.getAttribute('maxlength'), '160');
  projectInput.value = project;
  projectInput.emit('input');
  goalInput.value = goal;
  goalInput.emit('input');
  app.get('#direction-studio').click();
  assert.match(app.get('#workflow-prompt').textContent, /foundry-direction/);
  assert.match(app.get('#workflow-prompt').textContent, /studio/i);
  app.get('#tab-verify').click();
  const prompt = app.get('#workflow-prompt').textContent;
  assert.match(prompt, /foundry-verify/);
  assert.ok(prompt.includes(project), 'the project name retains Unicode and literal markup');
  assert.ok(prompt.includes(goal), 'the prompt includes the primary user goal');
  assert.equal(app.get('#workflow-prompt').querySelector('em'), null, 'context is displayed as text rather than HTML');
  app.get('#copy-prompt').click();
  await settle();
  assert.equal(app.copied.at(-1), prompt);

  projectInput.value = 'p'.repeat(81);
  projectInput.emit('input');
  assert.equal(app.get('#workflow-prompt').textContent, prompt);
  assert.match(app.get('#prompt-context-status').textContent, /80/);
  assert.equal(projectInput.getAttribute('aria-invalid'), 'true');
  app.get('#copy-prompt').click();
  await settle();
  assert.equal(app.copied.at(-1), prompt);
  projectInput.value = project;
  projectInput.emit('input');
  assert.equal(projectInput.getAttribute('aria-invalid'), 'false');
  const valid = app.get('#workflow-prompt').textContent;
  goalInput.value = 'g'.repeat(161);
  goalInput.emit('input');
  assert.equal(app.get('#workflow-prompt').textContent, valid);
  assert.match(app.get('#prompt-context-status').textContent, /160/);
  assert.equal(goalInput.getAttribute('aria-invalid'), 'true');
  goalInput.value = goal;
  goalInput.emit('input');
  app.get('#tab-audit').click();
  assert.match(app.get('#workflow-prompt').textContent, /foundry-audit/);
  assert.ok(app.get('#workflow-prompt').textContent.includes(project));
  assert.ok(app.get('#workflow-prompt').textContent.includes(goal));
});


test('conflicting notes remain exportable and reload requires an explicit confirmation', async t => {
  const storage = memoryStorage();
  let app = await loadApp({ storage });
  t.after(() => app.dispose());
  const peer = JSON.stringify({ version: 1, notes: [{ id: 'peer', kind: 'note', title: 'Saved in another tab', body: 'Keep this collection.' }] });
  storage.setItem(STORAGE_KEY, peer);
  app.get('#new-note').click();
  app.get('#note-title').value = 'Temporary local idea';
  app.get('#note-form').emit('submit');
  await settle();
  assert.equal(storage.getItem(STORAGE_KEY), peer);
  assert.match(app.get('#workspace-status').textContent, /changed in another tab.*temporary.*Export.*reload/i);
  assert.equal(app.get('#reload-notes').hidden, false);
  app.get('#export-notes').click();
  const exported = JSON.parse(await app.blobs.get(app.document.downloads.at(-1).href).text());
  assert.ok(exported.notes.some(note => note.title === 'Temporary local idea'));
  app.get('#reset-notes').click();
  app.get('#reset-notes').click();
  assert.equal(storage.getItem(STORAGE_KEY), peer);
  assert.match(app.get('#workspace-status').textContent, /changed in another tab/);
  app.window.confirm = () => false;
  app.get('#reload-notes').click();
  assert.equal(app.window.reloads, 0);
  app.window.confirm = () => true;
  app.get('#reload-notes').click();
  assert.equal(app.window.reloads, 1);
  app.dispose();
  app = await loadApp({ storage });
  assert.equal(app.all('.note-card').length, 1);
  assert.match(app.get('.note-card').textContent, /Saved in another tab/);
  assert.equal(app.get('#reload-notes').hidden, true);
  assert.match(app.get('#workspace-status').textContent, /saved in this browser/);
});
