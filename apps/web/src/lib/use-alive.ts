import { useEffect, useRef } from 'react';

/**
 * Whether the screen that asks is still on the page: work that ends after the screen is gone
 * reads `current` before it sets any state, so nothing changes on a page that closed meanwhile.
 */
export function useAlive(): { readonly current: boolean } {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
