'use client';

import { SerwistProvider } from '@serwist/turbopack/react';
import type { ReactNode } from 'react';

/**
 * Registers the service worker in production builds only. Offline features (navigation caching,
 * the Dexie outbox, the photo queue) are added in T2.7, so caching on navigation and reloading
 * when the network returns stay off for now.
 */
export function ServiceWorkerProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== 'production'}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
