import type { FormDefinition } from '@css/shared/forms';
import type { Tx } from '../core/prisma.service.js';
import { readDefinition } from './forms.js';

/** How many published versions the process keeps; a public link opens one at a time. */
const KEPT = 100;

const kept = new Map<string, Promise<FormDefinition>>();

/**
 * The volunteer-visible definition of a published form version, read once per process and kept by
 * its id: a published version never changes (the database refuses any change of its rows), so
 * the public form's every read and submission need not read it again. Only what the caller has
 * found published goes in, after every check of the link has run on that request, so a link that
 * closed or moved answers closed whatever is kept. A read that failed is not kept.
 */
export function publishedDefinition(db: Tx, versionId: string): Promise<FormDefinition> {
  const hit = kept.get(versionId);
  if (hit) return hit;
  const read = readDefinition(db, versionId, 'volunteer');
  kept.set(versionId, read);
  read.catch(() => kept.delete(versionId));
  // the oldest goes once the process keeps more than it should
  if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
  return read;
}
