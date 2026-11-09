import { useSyncExternalStore } from 'react';
import { deviceInfo } from '../../api/client';

/**
 * The installation of the app (docs/architecture/OFFLINE_SYNC.md, the iOS limits and the
 * install guidance): Chrome on Android hands the page an install prompt the app keeps for the
 * moment the person asks; an iPhone has no prompt, so the app shows the steps of the share
 * sheet. The hint can be put away; the profile menu brings it back.
 */

/** The browser's install prompt, which the DOM library does not declare. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How this browser can install the app: through its prompt, by the iPhone's share sheet, or not. */
export type InstallWay = 'prompt' | 'ios' | 'none';

const DISMISSED_KEY = 'css_install_dismissed';

let deferred: InstallPromptEvent | null = null;
let installed = false;
let version = 0;
const listeners = new Set<() => void>();

const notify = () => {
  version += 1;
  for (const listener of listeners) listener();
};

/** Keeps the browser's install prompt for later; called once when the app starts. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** Whether the app runs as an installed app already. */
export function standalone(): boolean {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia : null;
  return (
    media?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function installWay(): InstallWay {
  if (installed || standalone()) return 'none';
  if (deferred) return 'prompt';
  return deviceInfo().platform === 'ios' ? 'ios' : 'none';
}

/** Shows the browser's prompt; true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome !== 'accepted') return false;
  deferred = null;
  notify();
  return true;
}

export function hintDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissHint(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // storage may be unavailable in a private window; the hint shows again next time
  }
  notify();
}

export function showHintAgain(): void {
  try {
    window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // nothing to clear
  }
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => version;

/** The install state for a screen; it renders again when the prompt arrives or the hint is put away. */
export function useInstall(): { way: InstallWay; dismissed: boolean } {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { way: installWay(), dismissed: hintDismissed() };
}

export function resetInstallForTests(): void {
  deferred = null;
  installed = false;
  showHintAgain();
}
