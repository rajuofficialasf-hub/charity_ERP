/**
 * The one local-data wipe of the PWA (AUTH.md 8, OFFLINE_SYNC 8): runs on logout, on a revoked
 * session and on refresh-token reuse. It removes what this device keeps for the signed-in user:
 * API caches of the service worker, the app's IndexedDB databases (`css-*`) and session storage.
 * The outbox and photo queue arrive in T2.7 and register here. The language choice
 * (`css_locale`) is a device preference and stays.
 */
export async function wipeLocalData(): Promise<void> {
  try {
    window.sessionStorage.clear();
  } catch {
    // Storage may be unavailable in private windows.
  }
  if ('caches' in window) {
    const names = await window.caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith('css-api')).map((name) => window.caches.delete(name)),
    );
  }
  if ('indexedDB' in window && typeof window.indexedDB.databases === 'function') {
    const databases = await window.indexedDB.databases();
    await Promise.all(
      databases
        .map((db) => db.name)
        .filter((name): name is string => Boolean(name?.startsWith('css-')))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = window.indexedDB.deleteDatabase(name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve();
            }),
        ),
    );
  }
}
