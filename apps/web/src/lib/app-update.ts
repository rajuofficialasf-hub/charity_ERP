/**
 * A new version of the app waiting in the service worker (docs/architecture/OFFLINE_SYNC.md,
 * the app shell and the service worker): the registration announces it, the shell's banner
 * offers the reload, and only that tap lets the new worker take over.
 */
let reload: (() => void) | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

/** A new worker waits; `run` lets it take over and reloads the page. */
export function announceUpdate(run: () => void): void {
  reload = run;
  notify();
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The reload of the waiting version, or null while the app is current. */
export function pendingUpdate(): (() => void) | null {
  return reload;
}

export function resetUpdateForTests(): void {
  reload = null;
  notify();
}
