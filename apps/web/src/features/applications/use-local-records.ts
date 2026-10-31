import { useEffect, useState } from 'react';
import type { SyncInfo } from '../../offline/applications-store';
import type { ApplicationSummary } from './applications-api';

/** The store and the engine, loaded only when a screen needs what the phone holds. */
export const loadStore = () => import('../../offline/applications-store');

export interface LocalRecords {
  /** The drafts the server does not know yet, as list rows. */
  drafts: (ApplicationSummary & { sync: SyncInfo })[];
  /** The sync state of the server's records that still have something on its way. */
  syncOf: Map<string, SyncInfo>;
}

const NONE: LocalRecords = { drafts: [], syncOf: new Map() };

/**
 * What the phone holds beside the server's lists, refreshed whenever the engine moves. A
 * session without an open store (an official, a token without a session) has nothing local.
 */
export function useLocalRecords(): LocalRecords {
  const [state, setState] = useState<LocalRecords>(NONE);
  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;
    void loadStore().then(async (store) => {
      const refresh = async () => {
        try {
          const [drafts, syncOf] = await Promise.all([
            store.localSummaries(),
            store.syncOfServerRecords(),
          ]);
          if (alive) setState({ drafts, syncOf });
        } catch {
          // the store is not open for this session: nothing is held locally
        }
      };
      await refresh();
      if (alive) stop = store.subscribe(() => void refresh());
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, []);
  return state;
}
