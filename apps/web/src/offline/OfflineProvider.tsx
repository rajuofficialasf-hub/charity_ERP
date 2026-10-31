import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOnline } from '../components/shell/use-online';
import { useAuth } from '../lib/auth';
import type { SyncEngine, SyncStatus } from './sync-engine';

export interface OfflineValue {
  status: SyncStatus;
  online: boolean;
  /** The person asks for a sync now; the data set is pulled as well. */
  syncNow: () => Promise<void>;
}

const IDLE: SyncStatus = {
  state: 'idle',
  pending: 0,
  syncing: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
};

const OfflineContext = createContext<OfflineValue>({
  status: IDLE,
  online: true,
  syncNow: () => Promise.resolve(),
});

/** The store and the engine, loaded only once a volunteer is signed in, so the login chunk stays small. */
const loadEngine = () => import('./sync-engine');

/**
 * Runs the sync engine for a signed-in volunteer and hands its status to the screens. The
 * engine starts when the volunteer is known and stops when they are not; the cached `me` of the
 * last sign-in is kept for the open without network.
 */
export function OfflineProvider({
  children,
  engine: given,
}: {
  children: ReactNode;
  /** The tests hand in an engine of their own; the app loads the one of the page. */
  engine?: SyncEngine;
}) {
  const { me } = useAuth();
  const online = useOnline();
  const [status, setStatus] = useState<SyncStatus>(given?.status ?? IDLE);
  const engineRef = useRef<SyncEngine | null>(given ?? null);
  const volunteerId = me?.kind === 'volunteer' ? me.id : null;

  useEffect(() => {
    if (!volunteerId || !me) return;
    let stopped = false;
    let cleanup: (() => void) | null = null;
    void (async () => {
      const engine = given ?? (await loadEngine()).syncEngine;
      if (stopped) return;
      engineRef.current = engine;
      const unsubscribe = engine.subscribe(setStatus);
      const { offlineDb } = await import('./db');
      const { currentDataKey } = await import('./keys');
      const { META } = await import('./snapshot');
      if (!stopped && currentDataKey())
        await offlineDb()
          .meta.put({ key: META.me, value: me })
          .catch(() => undefined);
      if (stopped) {
        unsubscribe();
        return;
      }
      engine.start();
      cleanup = () => {
        unsubscribe();
        engine.stop();
      };
    })();
    return () => {
      stopped = true;
      cleanup?.();
    };
    // the engine follows the signed-in volunteer, not every change of their profile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volunteerId, given]);

  const syncNow = useCallback(
    () => engineRef.current?.flush('manual', { snapshot: true }) ?? Promise.resolve(),
    [],
  );
  const value = useMemo<OfflineValue>(
    () => ({ status, online, syncNow }),
    [status, online, syncNow],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  return useContext(OfflineContext);
}
