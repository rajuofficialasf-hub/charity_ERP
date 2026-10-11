import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False in the server-rendered HTML and until React has hydrated, true afterwards. Submit buttons
 * stay disabled until then, so a slow phone never submits a form natively (T1.7).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
