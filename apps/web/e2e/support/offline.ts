import { type BrowserContext, expect, type Locator, type Page } from '@playwright/test';

// Shared steps of the offline specs (offline.spec.ts; docs/architecture/OFFLINE_SYNC.md, the test
// strategy): the network switched off and on, a slow link, and the moment the phone has its data
// set.

/** A one-pixel PNG, enough for the photo field and the server's type check. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** The phone loses its connection; every request fails on the way. */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

/** The connection returns. */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}

/**
 * A slow 3G link on a Chromium page (the mobile project): 400 kbit/s both ways and 400 ms of
 * latency, until the returned function lifts it. A page of another engine is left as it is.
 */
export async function throttle3g(page: Page): Promise<() => Promise<void>> {
  if (page.context().browser()?.browserType().name() !== 'chromium') return async () => undefined;
  const cdp = await page.context().newCDPSession(page);
  const kbps = (400 * 1024) / 8;
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: kbps,
    uploadThroughput: kbps,
  });
  return async () => {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp.detach();
  };
}

/**
 * Waits until the signed-in phone has pulled its data set and the locations master, so the
 * project, its form and the address lists are on the phone before the network goes away.
 * Register before the sign-in: the pull starts the moment the session is known.
 */
export function dataSetArrives(page: Page): Promise<void> {
  const snapshot = page.waitForResponse(
    (r) => r.url().includes('/api/v1/sync/snapshot') && r.ok(),
    { timeout: 30_000 },
  );
  const locations = page.waitForResponse(
    (r) => r.url().includes('/api/v1/locations/all') && r.ok(),
    { timeout: 30_000 },
  );
  return Promise.all([snapshot, locations]).then(() => locationsStored(page));
}

/**
 * Waits until the locations master is written to the phone's store: the rows arrive in one
 * response but are stored a moment later, and a navigation in between would cut the write.
 */
export async function locationsStored(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('css-offline');
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          try {
            const read = db
              .transaction('meta', 'readonly')
              .objectStore('meta')
              .get('locations.version');
            read.onsuccess = () => {
              db.close();
              resolve(read.result !== undefined);
            };
            read.onerror = () => {
              db.close();
              resolve(false);
            };
          } catch {
            db.close();
            resolve(false);
          }
        };
      }),
    undefined,
    { timeout: 60_000, polling: 500 },
  );
}

/** The application number inside the page or the row, as the list and the detail print it. */
export async function syncedNumber(where: Page | Locator): Promise<string> {
  const text = await where
    .getByText(/[A-Z0-9]+-\d{4}-\d{5}/)
    .first()
    .textContent();
  const appNo = /([A-Z0-9]+-\d{4}-\d{5})/.exec(text ?? '')?.[1];
  expect(appNo, text ?? '').toBeTruthy();
  return appNo!;
}
