import { rmSync } from 'node:fs';
import { join } from 'node:path';

/** Each contract run starts with an empty record of the calls it reached. */
export default function clearRecord(): void {
  rmSync(join(__dirname, '../../../test-results/contract'), { recursive: true, force: true });
}
