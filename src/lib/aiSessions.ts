export type ChatRole = 'user' | 'assistant' | 'sample';
export type ChatMessage<R extends ChatRole> = { id: number; role: R; content: string };
export type ActivitySession<R extends ChatRole> = { messages: ChatMessage<R>[]; prompt: string };

/** Recover this tab's recent conversations without depending on browser storage. */
export function readActivitySessions<R extends ChatRole>(key: string, roles: readonly R[]): Map<string, ActivitySession<R>> {
  const sessions = new Map<string, ActivitySession<R>>();
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return sessions;
    for (const [activity, raw] of Object.entries(saved).slice(0, 5)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const session = raw as Record<string, unknown>;
      if (!Array.isArray(session.messages)) continue;
      const messages: ChatMessage<R>[] = [];
      const ids = new Set<number>();
      for (const rawMessage of session.messages.slice(-40)) {
        if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) continue;
        const message = rawMessage as Record<string, unknown>;
        if (!Number.isSafeInteger(message.id) || (message.id as number) < 0 || ids.has(message.id as number)
          || !roles.includes(message.role as R) || typeof message.content !== 'string') continue;
        ids.add(message.id as number);
        messages.push({ id: message.id as number, role: message.role as R, content: message.content.slice(0, 6000) });
      }
      sessions.set(activity, { messages, prompt: typeof session.prompt === 'string' ? session.prompt.slice(0, 2000) : '' });
    }
  } catch { /* An unavailable or full store still allows a conversation in memory. */ }
  return sessions;
}

export function saveActivitySessions<R extends ChatRole>(key: string, sessions: Map<string, ActivitySession<R>>) {
  try {
    const saved = Object.fromEntries([...sessions].slice(0, 5).map(([activity, session]) => [activity, {
      messages: session.messages.slice(-40).map(message => ({ ...message, content: message.content.slice(0, 6000) })),
      prompt: session.prompt.slice(0, 2000),
    }]));
    sessionStorage.setItem(key, JSON.stringify(saved));
  } catch { /* Storage restrictions must not interrupt writing or replies. */ }
}
