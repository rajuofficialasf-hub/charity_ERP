/**
 * The one local-data wipe of the PWA (AUTH.md 8, OFFLINE_SYNC 8): runs on logout, on a revoked
 * session and on refresh-token reuse. It removes what this device keeps for the signed-in user:
 * the offline store (`css-offline`, with its outbox, photo queue and keys), any other IndexedDB
 * database of the app (`css-*`), the API caches of the service worker and session storage. No
 * step may skip the next: each is guarded on its own. The language choice (`css_locale`) is a
 * device preference and stays, as does the note of records lost before a login, which the next
 * login reports.
 */
export async function wipeLocalData(): Promise<void> {
  try {
    window.sessionStorage.clear();
  } catch {
    // Storage may be unavailable in private windows.
  }
  // the store first, by its name: its module closes the connection, deletes the database and
  // falls back to emptying the tables when another tab still holds it open
  try {
    const [db, keys] = await Promise.all([import('../offline/db'), import('../offline/keys')]);
    keys.forgetKeys();
    await db.deleteOfflineDb();
  } catch {
    // without IndexedDB there is no store to delete
  }
  try {
    if ('caches' in window) {
      const names = await window.caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('css-api'))
          .map((name) => window.caches.delete(name)),
      );
    }
  } catch {
    // the Cache API may be unavailable; the store above is already gone
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
