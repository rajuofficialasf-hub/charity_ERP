import type { FormDefinition } from '@css/shared/forms';
import { isTransientStatus } from '@css/shared/sync';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { type ApiErrorDetail, ApiFailure } from '../../api/client';
import { type FormVersion, saveDraft } from './forms-api';

/** How long the builder waits after the last change before it saves. */
export const SAVE_DELAY_MS = 1500;
/** The waits before a save that failed on the way is sent again by itself, one after the other. */
export const SAVE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000];
/** The wait between the tries that follow those. */
export const SAVE_RETRY_EVERY_MS = 30_000;

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

/** Why the draft on screen is not saved, while the state is `failed`. */
export interface SaveFailure {
  /**
   * `retrying`: the network or the server failed, and the save is sent again by itself.
   * `draft`: the server refused this draft (a 422); the same draft would be refused again, so it
   * waits for the next change. `other`: any other answer; it waits for the person's retry.
   */
  kind: 'retrying' | 'draft' | 'other';
  /** The server's words, when it gave any. */
  message: string | null;
}

const NO_DETAILS: readonly ApiErrorDetail[] = [];

/** What a refused save or publish names: the details of a 422, none of any other answer. */
export const refusalOf = (error: unknown): readonly ApiErrorDetail[] =>
  error instanceof ApiFailure && error.status === 422 ? error.details : NO_DETAILS;

/**
 * The messages of a refusal by the question or section they name: every message of a place, in
 * the server's order, the same sentence said once.
 */
export function detailsOf(
  details: readonly Pick<ApiErrorDetail, 'path' | 'message'>[],
): Record<string, string[]> {
  const byPlace = new Map<string, string[]>();
  for (const detail of details) {
    const path = detail.path ?? '';
    const messages = byPlace.get(path) ?? [];
    if (!messages.includes(detail.message)) messages.push(detail.message);
    byPlace.set(path, messages);
  }
  return Object.fromEntries(byPlace);
}

/** A failure worth sending again: the network, a timeout, a busy or failing server. */
const failedOnTheWay = (error: unknown) =>
  !(error instanceof ApiFailure) || isTransientStatus(error.status);

/**
 * Saves the builder's draft by itself: a while after the last change the whole draft goes to the
 * server with the version it was read at, one save at a time; a change made meanwhile is saved
 * next. A save that fails on the way (no network, a failing server) is sent again by itself after
 * a growing wait, at once when the browser is back online, and when the person asks; a draft the
 * server refuses waits for the next change. What the server names in a refused draft comes back
 * as its details, until a save goes through; a version changed elsewhere reloads the draft; a refusal of the person turns the
 * builder read-only. Leaving with a change not yet saved saves it first and goes on; only when
 * that save fails is the person asked.
 */
export function useDraftSave({
  version,
  etag,
  onSaved,
  onStale,
}: {
  version: FormVersion | undefined;
  etag: string | undefined;
  onSaved: (version: FormVersion, etag: string) => void;
  onStale: () => void;
}) {
  const [state, setState] = useState<SaveState>('saved');
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [details, setDetails] = useState<readonly ApiErrorDetail[]>(NO_DETAILS);
  const [refused, setRefused] = useState(false);
  const [stale, setStale] = useState(false);
  const queued = useRef<FormDefinition | null>(null);
  /** The save on its way; it resolves to whether nothing is left to save. */
  const flight = useRef<Promise<boolean> | null>(null);
  // read inside the save, which outlives the render that started it
  const refusedNow = useRef(false);
  const tag = useRef(etag);
  /** The wait after the last change. */
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The wait before a failed save is sent again, and how many times it failed in a row. */
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failures = useRef(0);
  /** The page is gone: a save still on its way starts no further wait. */
  const gone = useRef(false);
  useEffect(() => {
    tag.current = etag;
  }, [etag]);
  const stopWaiting = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
  };
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      clearTimeout(timer.current);
      clearTimeout(retryTimer.current);
    };
  }, []);

  /** Sends what waits, one draft after the other; false when a draft could not be saved. */
  const work = async (): Promise<boolean> => {
    for (;;) {
      const definition = queued.current;
      if (!definition) return !refusedNow.current;
      if (!version || !tag.current || refusedNow.current) return false;
      queued.current = null;
      setState('saving');
      try {
        const saved = await saveDraft(version.id, tag.current, definition);
        tag.current = saved.meta.etag;
        failures.current = 0;
        setDetails(NO_DETAILS);
        setStale(false);
        setFailure(null);
        onSaved(saved.data, saved.meta.etag);
        // a change made while this save ran goes next
        if (queued.current) continue;
        setState('saved');
        return true;
      } catch (error) {
        const message = error instanceof ApiFailure ? error.message : null;
        if (error instanceof ApiFailure && error.status === 412) {
          queued.current = null;
          setStale(true);
          setFailure(null);
          setState('saved');
          onStale();
          return false;
        }
        if (error instanceof ApiFailure && error.status === 403) {
          queued.current = null;
          refusedNow.current = true;
          setRefused(true);
          setFailure({ kind: 'other', message });
          setState('failed');
          return false;
        }
        // keep the change for the next try, unless a newer one is waiting
        queued.current ??= definition;
        const draftRefused = error instanceof ApiFailure && error.status === 422;
        if (draftRefused) setDetails(refusalOf(error));
        const again = failedOnTheWay(error);
        setFailure({ kind: again ? 'retrying' : draftRefused ? 'draft' : 'other', message });
        setState('failed');
        // a newer change is about to be sent anyway; otherwise this one is, after its wait
        if (again && timer.current === undefined && !gone.current) {
          const wait = SAVE_RETRY_DELAYS_MS[failures.current] ?? SAVE_RETRY_EVERY_MS;
          failures.current += 1;
          const asked = error instanceof ApiFailure ? (error.retryAfter ?? 0) * 1000 : 0;
          clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(
            () => {
              retryTimer.current = undefined;
              void send();
            },
            Math.max(wait, asked),
          );
        }
        return false;
      }
    }
  };

  /** Saves what waits now, joining the save on its way; whether nothing is left unsaved. */
  const send = (): Promise<boolean> => {
    flight.current ??= work().finally(() => {
      flight.current = null;
    });
    return flight.current;
  };

  /** Saves now instead of after the wait: the person's retry, the network back, a departure. */
  const saveNow = (): Promise<boolean> => {
    stopWaiting();
    // the save on its way may be an earlier draft's; what was changed since goes right after it
    return send();
  };

  /** Asks for the draft to be saved a little later. */
  const schedule = (definition: FormDefinition) => {
    if (refusedNow.current) return;
    queued.current = definition;
    setStale(false);
    setState('pending');
    stopWaiting();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void send();
    }, SAVE_DELAY_MS);
  };

  /** Sends the failed save again at once, without waiting for its turn. */
  const retry = () => void saveNow();

  // the browser says the network is back: no reason to wait out the rest of the pause
  const waitsForNetwork = state === 'failed' && failure?.kind === 'retrying';
  const onOnline = useEffectEvent(retry);
  useEffect(() => {
    if (!waitsForNetwork) return;
    const again = () => onOnline();
    window.addEventListener('online', again);
    return () => window.removeEventListener('online', again);
  }, [waitsForNetwork]);

  const unsaved = state === 'pending' || state === 'saving' || state === 'failed';
  /** How the save before a departure ended; none while it runs, and when nobody is leaving. */
  const [leaveSave, setLeaveSave] = useState<'saved' | 'failed' | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!unsaved || refused || currentLocation.pathname === nextLocation.pathname) return false;
    // the departure is held while the change is saved; how that ends decides what follows
    setLeaveSave(null);
    void saveNow().then((saved) => setLeaveSave(saved ? 'saved' : 'failed'));
    return true;
  });
  const held = blocker.state === 'blocked';
  // saved: the departure goes on by itself; the person is asked only when the save failed
  useEffect(() => {
    if (held && leaveSave === 'saved') blocker.proceed?.();
  }, [held, leaveSave, blocker]);
  const leave = {
    /** The save before leaving failed, and the person decides. */
    asking: held && leaveSave === 'failed',
    stay: () => {
      setLeaveSave(null);
      blocker.reset?.();
    },
    go: () => {
      setLeaveSave(null);
      blocker.proceed?.();
    },
  };

  // the last guard, for a closed tab or a reload: the browser's own question
  useEffect(() => {
    if (!unsaved || refused) return;
    const hold = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', hold);
    return () => window.removeEventListener('beforeunload', hold);
  }, [unsaved, refused]);

  return {
    state,
    failure: state === 'failed' ? failure : null,
    details,
    refused,
    stale,
    schedule,
    retry,
    leave,
  };
}
