import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import { LoadFailed } from '../components/LoadFailed';
import { withRest } from '../i18n/locale';

/**
 * A lazy route's page: the named export of its module, loaded together with the rest of the
 * catalogue (`withRest`), so the page renders only once its texts are in. React Router keeps what a
 * route's `lazy` answers for as long as the page lives, a rejection too, so a page whose chunk or
 * texts failed to load (offline) would fail on every later visit until a reload. A failed load
 * therefore answers a page that loads it again: by itself once the network returns, or from its
 * button. A name the module does not export as a component fails the typecheck.
 */
export function page<K extends string, M extends Record<K, ComponentType>>(
  load: () => Promise<M>,
  name: K,
): () => Promise<{ Component: ComponentType }> {
  let loaded: ComponentType | null = null;
  const attempt = async (): Promise<ComponentType> => {
    // eslint-disable-next-line security/detect-object-injection -- an export name the type checks
    loaded = (await withRest(load()))[name];
    return loaded;
  };
  // drawn anew at each visit, so a visit after a later success finds the page loaded
  const Retrying = () => <LoadAgain attempt={attempt} loaded={loaded} />;
  return async () => {
    try {
      return { Component: await attempt() };
    } catch (error) {
      console.error(error);
      return { Component: Retrying };
    }
  };
}

/** The page of a route whose load failed: the loaded page once a new attempt succeeds. */
function LoadAgain({
  attempt,
  loaded,
}: {
  attempt: () => Promise<ComponentType>;
  loaded: ComponentType | null;
}) {
  const [Loaded, setLoaded] = useState<ComponentType | null>(() => loaded);
  const [trying, setTrying] = useState(false);
  const busy = useRef(false);
  const retry = useCallback(() => {
    // the network's return and a press of the button may come together: one attempt at a time
    if (busy.current) return;
    busy.current = true;
    setTrying(true);
    attempt()
      .then((Component) => setLoaded(() => Component))
      .catch((error: unknown) => {
        console.error(error);
        // a browser may keep a failed module for the page's life: with the network back, a
        // reload is the one way left to fetch it
        if (navigator.onLine) window.location.reload();
      })
      .finally(() => {
        busy.current = false;
        setTrying(false);
      });
  }, [attempt]);
  useEffect(() => {
    if (Loaded) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [Loaded, retry]);
  if (Loaded) return <Loaded />;
  return <LoadFailed onRetry={retry} trying={trying} />;
}
