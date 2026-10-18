import { BREAKPOINTS } from '@css/ui';
import { useEffect, useState } from 'react';

/** Whether the browser reports a connection; follows its `online` and `offline` events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export type ShellWidth = 'phone' | 'tablet' | 'desktop';

const TABLET = `(min-width: ${BREAKPOINTS.sm}px)`;
const DESKTOP = `(min-width: ${BREAKPOINTS.lg}px)`;

const widthNow = (): ShellWidth => {
  // a browser without matchMedia (a test runner) is treated as a desktop
  if (!window.matchMedia) return 'desktop';
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  return window.matchMedia(TABLET).matches ? 'tablet' : 'phone';
};

/**
 * The width class of the screen, so the shell renders only the navigation of that width and
 * screen readers never meet the same links twice.
 */
export function useShellWidth(): ShellWidth {
  const [width, setWidth] = useState(widthNow);
  useEffect(() => {
    if (!window.matchMedia) return;
    const queries = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)];
    const update = () => setWidth(widthNow());
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return width;
}
