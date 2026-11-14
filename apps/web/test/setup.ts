import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { cleanup } from '@testing-library/react';
import Dexie from 'dexie';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { closeOfflineDb, OFFLINE_DB_NAME } from '../src/offline/db';
import { forgetKeys } from '../src/offline/keys';
import { bn, en } from '@css/shared/i18n';
import { primeMessages } from '../src/i18n/locale';
import { server } from './msw/server';

// Both catalogues are there from the start, each whole (its start and rest parts), as after a
// first switch of the language on a page past the login; the loading itself is tested in
// src/i18n/locale.test.ts and src/i18n/LocaleProvider.test.tsx.
primeMessages('bn', bn);
primeMessages('en', en);

// jsdom has no WebCrypto; the store's cryptography runs on Node's, as the browser's would
if (!globalThis.crypto?.subtle)
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

// Every network call in a component test must hit an MSW handler; anything else fails the test.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  // the phone's store of one test never reaches the next
  forgetKeys();
  closeOfflineDb();
  await Dexie.delete(OFFLINE_DB_NAME);
});
afterAll(() => server.close());
