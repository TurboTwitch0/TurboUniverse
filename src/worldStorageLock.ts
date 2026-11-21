/** Keep ordinary storage usable when native locks are unavailable or denied. */
export async function withWorldStorageLock<T>(key: string, action: () => T, locks?: Pick<LockManager, 'request'>): Promise<T> {
  if (typeof locks?.request !== 'function') return action();
  let started = false;
  try {
    return await locks.request(key, () => {
      started = true;
      return action();
    });
  } catch (error) {
    if (started) throw error;
    // This fallback is ordered per page; it cannot make separate tabs atomic.
    return action();
  }
}
