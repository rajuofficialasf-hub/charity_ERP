import type { ExportList } from '@css/shared/exports';
import type { ExportColumnView } from './exports-api';

const KEY = 'css_export_columns';

const keyOf = (list: ExportList) => `${KEY}:${list}`;

/**
 * The columns ticked when the dialog opens: the person's last choice for this list on this device,
 * less any column they can no longer export; the first time, the columns the list shows on screen.
 * The order is the catalogue's, which is the file's.
 */
export function rememberedColumns(
  list: ExportList,
  available: readonly ExportColumnView[],
): string[] {
  let saved: unknown;
  try {
    const text = localStorage.getItem(keyOf(list));
    saved = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    saved = null;
  }
  const chosen =
    Array.isArray(saved) && saved.every((id) => typeof id === 'string')
      ? new Set(saved as string[])
      : null;
  return available.filter((c) => (chosen ? chosen.has(c.id) : c.onScreen)).map((c) => c.id);
}

/** Keeps the person's choice for the next time on this device; a full storage just forgets. */
export function rememberColumns(list: ExportList, ids: readonly string[]): void {
  try {
    localStorage.setItem(keyOf(list), JSON.stringify(ids));
  } catch {
    // private browsing or a full storage: the next dialog starts from the on-screen columns
  }
}
