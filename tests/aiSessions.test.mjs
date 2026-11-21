import test from 'node:test';
import assert from 'node:assert/strict';
import { readActivitySessions, saveActivitySessions } from '../src/lib/aiSessions.ts';

function storage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const saved = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage; });
  return saved;
}

test('Recent chats and drafts survive tab refresh, and Clear remains cleared', t => {
  storage(t);
  const sessions = new Map([['Chat', { messages: [{ id: 1, role: 'user', content: 'Hello' }], prompt: 'A draft' }]]);
  saveActivitySessions('test', sessions);
  assert.deepEqual(readActivitySessions('test', ['user', 'assistant']), sessions);
  sessions.set('Chat', { messages: [], prompt: '' });
  saveActivitySessions('test', sessions);
  assert.deepEqual(readActivitySessions('test', ['user', 'assistant']).get('Chat'), { messages: [], prompt: '' });
});

test('Session recovery bounds old data and rejects malformed message roles or duplicate IDs', t => {
  const saved = storage(t);
  saved.set('test', JSON.stringify({ Chat: { messages: [
    { id: 1, role: 'user', content: 'A'.repeat(7000) },
    { id: 1, role: 'user', content: 'Duplicate' },
    { id: 2, role: 'system', content: 'Invalid role' },
  ], prompt: 'B'.repeat(3000) } }));
  const recovered = readActivitySessions('test', ['user', 'assistant']).get('Chat');
  assert.equal(recovered.messages.length, 1);
  assert.equal(recovered.messages[0].content.length, 6000);
  assert.equal(recovered.prompt.length, 2000);
  recovered.messages = Array.from({ length: 60 }, (_, id) => ({ id, role: 'user', content: String(id) }));
  saveActivitySessions('test', new Map([['Chat', recovered]]));
  assert.equal(readActivitySessions('test', ['user']).get('Chat').messages.length, 40);
});

test('Blocked or corrupted browser storage leaves an empty usable workspace', t => {
  const saved = storage(t);
  saved.set('test', '{bad json');
  assert.equal(readActivitySessions('test', ['user']).size, 0);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Blocked'); } });
  assert.equal(readActivitySessions('test', ['user']).size, 0);
  assert.doesNotThrow(() => saveActivitySessions('test', new Map()));
});
