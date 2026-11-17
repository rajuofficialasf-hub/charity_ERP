import { createHash } from 'node:crypto';

/** Fixed time part of stable ids: 2026-10-11T00:00:00Z. */
export const STABLE_ID_TIME = Date.UTC(2026, 9, 11);

/**
 * A stable UUID (version 7 layout) for a key: the fixed time, the rest from SHA-256 of the key.
 * The development seed and the production sync of the shipped reference data
 * (`pnpm db:migrate`) give a row the same id this way, so the seed run after a sync finds the
 * row the sync wrote instead of a second one.
 */
export function stableId(key: string): string {
  const hash = createHash('sha256').update(`css-erp-seed:${key}`).digest();
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(STABLE_ID_TIME, 0, 6);
  hash.copy(bytes, 6, 0, 10);
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
