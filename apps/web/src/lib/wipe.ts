/**
 * The one local-data wipe of the PWA (AUTH.md 8, OFFLINE_SYNC 8): runs on logout, on a revoked
 * session and on refresh-token reuse. It removes what this device keeps for the signed-in user:
 * API caches of the service worker, the app's IndexedDB databases (`css-*`, among them the
 * offline store `css-offline` with its outbox, photo queue and keys) and session storage. The
 * language choice (`css_locale`) is a device preference and stays, as does the note of records
 * lost before a login, which the next login reports.
 */
export async function wipeLocalData(): Promise<void> {
  try {
    window.sessionStorage.clear();
  } catch {
    // Storage may be unavailable in private windows.
  }
  // the store's connection closes first, so its delete is not blocked, and its open key is forgotten
  try {
    const [db, keys] = await Promise.all([import('../offline/db'), import('../offline/keys')]);
    keys.forgetKeys();
    db.closeOfflineDb();
  } catch {
    // without the store module there is nothing to close
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
