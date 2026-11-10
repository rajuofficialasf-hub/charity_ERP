import { uuidv7 } from '@css/shared';
import { useState } from 'react';

const fresh = (n: number) => Array.from({ length: n }, () => uuidv7());

/**
 * Stable React keys for the rows of a list kept as plain data without ids (the saved JSON of a
 * calculation, a condition, score ranges, fund sources). A key is made when its row appears and
 * stays with that row, so removing a row never hands its field state to the row after it. The
 * keys are never saved: the editor calls `remove` beside its own change, and rows added at the end
 * get new keys.
 */
export function useRowKeys(count: number) {
  const [keys, setKeys] = useState(() => fresh(count));
  let current = keys;
  // follow the row count: new rows at the end get new keys, rows gone from the end lose theirs
  if (keys.length !== count) {
    current = keys.length < count ? [...keys, ...fresh(count - keys.length)] : keys.slice(0, count);
    setKeys(current);
  }
  return {
    keys: current,
    /** The row at this position is about to be removed: its key goes with it. */
    remove: (index: number) => setKeys((k) => k.filter((_, i) => i !== index)),
  };
}
