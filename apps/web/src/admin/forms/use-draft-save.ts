import type { FormDefinition } from '@css/shared/forms';
import { isTransientStatus, RETRY_AFTER_MAX_SECONDS } from '@css/shared/sync';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { type ApiErrorDetail, ApiFailure } from '../../api/client';
import { type FormVersion, type FormVersionRecord, saveDraft } from './forms-api';

/** How long the builder waits after the last change before it saves. */
export const SAVE_DELAY_MS = 1500;
/** The waits before a save that failed on the way is sent again by itself, one after the other. */
export const SAVE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000];
/** The wait between the tries that follow those. */
export const SAVE_RETRY_EVERY_MS = 30_000;
/** How long a save may go without an answer before it counts as failed on the way. */
export const SAVE_TIMEOUT_MS = 20_000;
/** How long a departure is held for its save before the person is asked. */
export const LEAVE_ASK_AFTER_MS = 3_000;

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

/**
 * A failed request worth sending again: no answer (the network, or the time limit that cut a
 * hanging one off), a timeout, a busy or failing server.
 */
const failedOnTheWay = (error: unknown) =>
  !(error instanceof ApiFailure) || isTransientStatus(error.status);

/** The wait a busy server asked for, never longer than the longest one followed. */
function askedWaitMs(error: unknown): number {
  const seconds = error instanceof ApiFailure ? error.retryAfter : undefined;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds, RETRY_AFTER_MAX_SECONDS) * 1_000;
}

/** An error of the page's own code goes where uncaught errors go, as the error it is. */
function report(error: unknown): void {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else
    queueMicrotask(() => {
      throw error;
    });
}

/**
 * Saves the builder's draft by itself: a while after the last change the whole draft goes to the
 * server with the version it was read at, one save at a time; a change made meanwhile is saved
 * next. A save that fails on the way (no network, no answer within the time limit, a failing
 * server) is sent again by itself after a growing wait (the wait a busy server asks for, up to a
 * cap), at once when the browser is back online, and when the person asks; a draft the
 * server refuses waits for the next change. What the server names in a refused draft comes back
 * as its details with the draft they are about, until a save goes through; a version changed
 * elsewhere reloads the draft; a refusal of the person turns the builder read-only. What the page
 * does with a saved draft (`onSaved`) is not part of the save: an error there is reported as it
 * is, and nothing is sent again. Leaving with a change not yet saved saves it first and goes on;
 * the person is asked when that save fails, and when it takes long.
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
  const [refusal, setRefusal] = useState<{
    details: readonly ApiErrorDetail[];
    draft: FormDefinition | null;
  }>({ details: NO_DETAILS, draft: null });
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
  /** The wait before a held departure asks the person, and the departure being held (0: none). */
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaving = useRef(0);
  const departures = useRef(0);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      clearTimeout(timer.current);
      clearTimeout(retryTimer.current);
      clearTimeout(leaveTimer.current);
    };
  }, []);

  /** A request that did not save the draft: what it says, and whether it is sent again. */
  const failed = (error: unknown, definition: FormDefinition): void => {
    const message = error instanceof ApiFailure ? error.message : null;
    if (error instanceof ApiFailure && error.status === 412) {
      queued.current = null;
      setStale(true);
      setFailure(null);
      setState('saved');
      onStale();
      return;
    }
    if (error instanceof ApiFailure && error.status === 403) {
      queued.current = null;
      refusedNow.current = true;
      setRefused(true);
      setFailure({ kind: 'other', message });
      setState('failed');
      return;
    }
    // keep the change for the next try, unless a newer one is waiting
    queued.current ??= definition;
    const draftRefused = error instanceof ApiFailure && error.status === 422;
    if (draftRefused) setRefusal({ details: refusalOf(error), draft: definition });
    const again = failedOnTheWay(error);
    setFailure({ kind: again ? 'retrying' : draftRefused ? 'draft' : 'other', message });
    setState('failed');
    // a newer change is about to be sent anyway; otherwise this one is, after its wait
    if (again && timer.current === undefined && !gone.current) {
      const wait = SAVE_RETRY_DELAYS_MS[failures.current] ?? SAVE_RETRY_EVERY_MS;
      failures.current += 1;
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(
        () => {
          retryTimer.current = undefined;
          void send();
        },
        Math.max(wait, askedWaitMs(error)),
      );
    }
  };

  /** Sends what waits, one draft after the other; false when a draft could not be saved. */
  const work = async (): Promise<boolean> => {
    for (;;) {
      const definition = queued.current;
      if (!definition) return !refusedNow.current;
      if (!version || !tag.current || refusedNow.current) return false;
      queued.current = null;
      setState('saving');
      // a connection that hangs gives no answer and no error: the time limit makes it one
      const limit = new AbortController();
      const limitTimer = setTimeout(() => limit.abort(), SAVE_TIMEOUT_MS);
      let saved: FormVersionRecord;
      try {
        saved = await saveDraft(version.id, tag.current, definition, limit.signal);
      } catch (error) {
        failed(error, definition);
        return false;
      } finally {
        clearTimeout(limitTimer);
      }
      tag.current = saved.meta.etag;
      failures.current = 0;
      setRefusal({ details: NO_DETAILS, draft: null });
      setStale(false);
      setFailure(null);
      // the draft is saved whatever the page does with it next: an error of the page's own is
      // not a failed save, so it is neither sent again nor shown as a lost connection
      try {
        onSaved(saved.data, saved.meta.etag);
      } catch (error) {
        report(error);
      }
      // a change made while this save ran goes next
      if (queued.current) continue;
      setState('saved');
      return true;
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
  /**
   * How the save before a departure stands: over (`saved`, `failed`) or taking long (`slow`);
   * none in its first moments, and when nobody is leaving.
   */
  const [leaveSave, setLeaveSave] = useState<'saved' | 'failed' | 'slow' | null>(null);
  /** The held departure is over, by the person's word or by the router. */
  const endLeave = () => {
    leaving.current = 0;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = undefined;
  };
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!unsaved || refused || currentLocation.pathname === nextLocation.pathname) return false;
    // a departure is held already and its one save decides: a further try starts no other
    if (leaving.current) return true;
    // the departure is held while the change is saved; how that ends decides what follows
    departures.current += 1;
    const mine = departures.current;
    leaving.current = mine;
    setLeaveSave(null);
    clearTimeout(leaveTimer.current);
    // a save that takes long leaves the person looking at nothing: they are asked meanwhile
    leaveTimer.current = setTimeout(() => {
      if (leaving.current === mine) setLeaveSave((now) => now ?? 'slow');
    }, LEAVE_ASK_AFTER_MS);
    void saveNow().then((saved) => {
      // a departure the person called off, or an earlier one, decides nothing
      if (leaving.current !== mine) return;
      clearTimeout(leaveTimer.current);
      setLeaveSave(saved ? 'saved' : 'failed');
    });
    return true;
  });
  const held = blocker.state === 'blocked';
  // the router let go of the departure (it went on, or another navigation took its place)
  useEffect(() => {
    if (!held) endLeave();
  }, [held]);
  // saved: the departure goes on by itself; the person is asked when the save failed or is slow
  useEffect(() => {
    if (held && leaveSave === 'saved') blocker.proceed?.();
  }, [held, leaveSave, blocker]);
  const leave = {
    /** The save before leaving failed or is taking long, and the person decides. */
    asking: held && (leaveSave === 'failed' || leaveSave === 'slow'),
    /** The person is asked while that save still runs. */
    saving: held && leaveSave === 'slow',
    stay: () => {
      endLeave();
      setLeaveSave(null);
      blocker.reset?.();
    },
    go: () => {
      endLeave();
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
    details: refusal.details,
    /** The draft those details are about: the one the server refused. */
    refusedDraft: refusal.draft,
    refused,
    stale,
    schedule,
    retry,
    leave,
  };
}
