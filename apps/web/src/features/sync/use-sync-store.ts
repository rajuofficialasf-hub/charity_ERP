import type { AttentionItem } from '@css/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import type { Overview } from '../../offline/applications-store';
import type { Reminder } from '../../offline/reminders';
import { loadStore } from '../applications/use-local-records';

type Store = Awaited<ReturnType<typeof loadStore>>;
const DAY_MS = 24 * 60 * 60_000;

/**
 * What the phone holds for the sync centre and the home, refreshed whenever the engine moves.
 * A session without an open store (an official, a browser without IndexedDB) has nothing: the
 * overview stays null and the screens show their empty state.
 */
export function useOverview(): {
  overview: Overview | null;
  store: Store | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { me } = useAuth();
  const volunteer = me?.kind === 'volunteer';
  const [store, setStore] = useState<Store | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settled, setSettled] = useState(false);

  const refresh = useCallback(async () => {
    if (!store) return;
    try {
      setOverview(await store.overview());
    } catch {
      // the store is not open for this session: nothing is held locally
      setOverview(null);
    } finally {
      setSettled(true);
    }
  }, [store]);

  useEffect(() => {
    if (!volunteer) return;
    let alive = true;
    void loadStore().then((loaded) => {
      if (alive) setStore(loaded);
    });
    return () => {
      alive = false;
    };
  }, [volunteer]);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    const run = () => {
      if (alive) void refresh();
    };
    run();
    const stop = store.subscribe(run);
    return () => {
      alive = false;
      stop();
    };
  }, [store, refresh]);

  return { overview, store, loading: volunteer && !settled, refresh };
}

/**
 * The device's own "needs your attention" items (docs/ui/SCREENS.md, "My Work home per role"):
 * records that could not be sent, records the office is verifying, and photos still to go. The
 * server never counts these; they live on this phone.
 */
export function useSyncAttention(): AttentionItem[] {
  const { overview } = useOverview();
  if (!overview) return [];
  const failed = overview.records.filter((r) => r.sync.state === 'failed').length;
  const verifying = overview.records.filter(
    (r) => r.sync.state === 'synced' && r.sync.verificationReason,
  ).length;
  const photos = overview.photos.waitingCount;
  return [
    ...(failed ? [{ kind: 'sync_failed' as const, count: failed, href: '/sync' }] : []),
    ...(verifying
      ? [
          {
            kind: 'sync_verifying' as const,
            count: verifying,
            href: '/my-applications?tab=pending',
          },
        ]
      : []),
    ...(photos ? [{ kind: 'photos_pending' as const, count: photos, href: '/sync' }] : []),
  ];
}

/**
 * The reminder about records left waiting a day (docs/architecture/OFFLINE_SYNC.md, "Values
 * decided"): shown once a day while anything waits, gone once everything went. It is looked
 * for whenever the engine moves, so the daily flushes bring the next one.
 */
export function useSyncReminder(): {
  reminder: (Reminder & { days: number }) | null;
  dismiss: () => void;
} {
  const { me } = useAuth();
  const volunteer = me?.kind === 'volunteer';
  const [reminder, setReminder] = useState<(Reminder & { days: number }) | null>(null);

  useEffect(() => {
    if (!volunteer) return;
    let alive = true;
    let stop: (() => void) | undefined;
    void Promise.all([loadStore(), import('../../offline/reminders')]).then(
      ([store, reminders]) => {
        // read from the store itself, not the engine's tallies: an engine that has not run yet
        // knows nothing of the records a closed app left behind
        const look = async () => {
          try {
            if ((await store.waitingCount()) === 0) {
              if (alive) setReminder(null);
              return;
            }
            const now = new Date();
            const due = await reminders.dueReminder(now);
            if (!due || !alive) return;
            const days = Math.max(1, Math.floor((now.getTime() - due.oldestAt.getTime()) / DAY_MS));
            setReminder({ ...due, days });
            // counted as shown only once it is on the screen
            await reminders.markReminderShown(now);
          } catch {
            // the store is not open for this session
          }
        };
        if (alive) stop = store.subscribe(() => void look());
      },
    );
    return () => {
      alive = false;
      stop?.();
    };
  }, [volunteer]);

  return { reminder, dismiss: () => setReminder(null) };
}
