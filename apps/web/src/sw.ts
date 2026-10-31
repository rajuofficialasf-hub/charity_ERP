/// <reference lib="webworker" />
import { BACKGROUND_SYNC_TAG } from '@css/shared/sync';
import {
  NavigationRoute,
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
} from 'serwist';

/**
 * The service worker (docs/architecture/OFFLINE_SYNC.md, the app shell and the service worker):
 * the build output and the fonts are precached, so the installed app opens without
 * network at any of its addresses; the API is never cached (the outbox is the offline write
 * path, and private data stays on the server); a new version waits until the person asks for
 * the reload; a Background Sync wakes an open window, since the worker holds no key.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** The Background Sync event, which the worker library of TypeScript does not declare. */
interface SyncEventLike extends ExtendableEvent {
  readonly tag: string;
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // a new worker waits until the page asks (UpdateReady): a form in progress is never swapped out
  skipWaiting: false,
  clientsClaim: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
  ],
});

// every address of the app opens from the precached shell; the API is left to the network
serwist.registerRoute(
  new NavigationRoute(serwist.createHandlerBoundToUrl('/index.html'), { denylist: [/^\/api\//] }),
);
serwist.addEventListeners();

// Background Sync (Android Chrome): the worker cannot read the outbox (the key lives in the
// page), so it asks every open window to flush; with none open, the next open flushes
self.addEventListener('sync', ((event: SyncEventLike) => {
  if (event.tag !== BACKGROUND_SYNC_TAG) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'flush' });
    }),
  );
}) as EventListener);
