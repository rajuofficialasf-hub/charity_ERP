import { useEffect, useState } from 'react';
import { orCached } from '../../lib/or-cached';
import type { OwnRecord, SyncInfo } from '../../offline/applications-store';
import { application, type ApplicationSummary } from './applications-api';

/** The store and the engine, loaded only when a screen needs what the phone holds. */
export const loadStore = () => import('../../offline/applications-store');

/**
 * The words of a failure the store itself raised, or null for any other error. The keys are
 * named here so the login chunk never loads the store for them.
 */
export function storeMessage(
  error: unknown,
  ts: (key: 'store_unavailable' | 'record_on_its_way') => string,
): string | null {
  if (!(error instanceof Error)) return null;
  if (error.message === 'offline.store_unavailable') return ts('store_unavailable');
  if (error.message === 'offline.record_on_its_way') return ts('record_on_its_way');
  return null;
}

/**
 * The record a volunteer's screen shows, by the id the address carries: a draft of the phone's
 * own while the server does not know it; else the server's record (through the phone's draft
 * row when the address still names the draft), kept on the phone for the open without network;
 * the phone's copy when the network is away. An edit waiting in the outbox overlays the answers.
 */
export async function recordOf(id: string): Promise<{ data: OwnRecord; meta: { etag?: string } }> {
  const store = await loadStore();
  const own = await store.localRecord(id).catch(() => null);
  if (own) return { data: own, meta: { etag: '' } };
  const serverId = await store.serverIdOf(id).catch(() => id);
  return orCached(
    async () => {
      const r = await application(serverId);
      await store.rememberRecord(r.data, r.meta.etag ?? '').catch(() => undefined);
      return { data: await store.withPendingEdit(r.data), meta: r.meta };
    },
    async () => {
      const cached = await store.cachedRecord(serverId);
      return cached ? { data: cached, meta: { etag: cached.etag } } : null;
    },
  );
}

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
