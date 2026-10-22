import type { FormDefinition } from '@css/shared/forms';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { ApiFailure } from '../../lib/api';
import { type FormVersion, saveDraft } from './forms-api';

/** How long the builder waits after the last change before it saves. */
export const SAVE_DELAY_MS = 1500;

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

/**
 * Saves the builder's draft by itself: a while after the last change the whole draft goes to the
 * server with the version it was read at, one save at a time; a change made meanwhile is saved
 * next. The server's messages for named questions come back by question; a version changed
 * elsewhere reloads the draft; a refusal turns the builder read-only. Leaving is held while a
 * change is not saved.
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState(false);
  const [stale, setStale] = useState(false);
  const queued = useRef<FormDefinition['sections'] | null>(null);
  const running = useRef(false);
  // read inside the save, which outlives the render that started it
  const refusedNow = useRef(false);
  const tag = useRef(etag);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    tag.current = etag;
  }, [etag]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = async () => {
    if (running.current || !queued.current || !version || !tag.current) return;
    const sections = queued.current;
    queued.current = null;
    running.current = true;
    setState('saving');
    // only a change made while this save ran goes next; a failed one waits for the next edit
    let again = false;
    try {
      const saved = await saveDraft(version.id, tag.current, sections);
      tag.current = saved.meta.etag;
      setErrors({});
      setStale(false);
      onSaved(saved.data, saved.meta.etag);
      again = queued.current !== null;
      setState(again ? 'pending' : 'saved');
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 412) {
        queued.current = null;
        setStale(true);
        setState('saved');
        onStale();
      } else if (error instanceof ApiFailure && error.status === 403) {
        queued.current = null;
        refusedNow.current = true;
        setRefused(true);
        setState('failed');
      } else {
        if (error instanceof ApiFailure && error.status === 422)
          setErrors(
            Object.fromEntries(error.details.map((d) => [d.path ?? '', d.message] as const)),
          );
        // keep the change for the next try, unless a newer one is waiting
        queued.current ??= sections;
        setState('failed');
      }
    } finally {
      running.current = false;
    }
    if (again && !refusedNow.current) void flush();
  };

  /** Asks for the draft to be saved a little later. */
  const schedule = (sections: FormDefinition['sections']) => {
    if (refusedNow.current) return;
    queued.current = sections;
    setStale(false);
    setState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const unsaved = state === 'pending' || state === 'saving' || state === 'failed';
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved && !refused && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!unsaved || refused) return;
    const hold = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', hold);
    return () => window.removeEventListener('beforeunload', hold);
  }, [unsaved, refused]);

  return { state, errors, refused, stale, schedule, blocker };
}
