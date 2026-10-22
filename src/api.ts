const OWNER_KEY_STORAGE = 'turbo-universe-owner-key';
export const OWNER_SESSION_EXPIRED = 'turbo-owner-session-expired';
let memoryKey = '';

export function getOwnerKey(): string {
  try { return sessionStorage.getItem(OWNER_KEY_STORAGE) || memoryKey; }
  catch { return memoryKey; }
}

export function setOwnerKey(key: string): void {
  memoryKey = key;
  try {
    if (key) sessionStorage.setItem(OWNER_KEY_STORAGE, key);
    else sessionStorage.removeItem(OWNER_KEY_STORAGE);
  } catch {
    // Browsers that block session storage keep the key only until this page closes.
  }
}

/** Add the owner credential only to protected requests on this application's origin. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const headers = new Headers(init.headers);
  const protectedRequest = url.origin === window.location.origin &&
    (url.pathname === '/api/admin' || (url.pathname.startsWith('/api/projects') && !['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase())));
  const key = protectedRequest ? getOwnerKey() : '';
  if (key) headers.set('Authorization', `Bearer ${key}`);
  const response = await fetch(input, { ...init, headers });
  if (key && response.status === 401) {
    setOwnerKey('');
    window.dispatchEvent(new Event(OWNER_SESSION_EXPIRED));
  }
  return response;
}
