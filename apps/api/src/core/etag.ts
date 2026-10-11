import { ApiError } from '../i18n/api-error';

/**
 * Optimistic concurrency (API_STANDARDS 6): the ETag of a record is derived from its
 * `updated_at`, which a trigger sets on every update; a write carries it back in `If-Match`.
 */
export function etagOf(updatedAt: Date): string {
  return `"${updatedAt.getTime().toString(36)}"`;
}

/** 412 `conflict.stale_version` unless `If-Match` names the current version (weak tags allowed). */
export function assertIfMatch(header: string | undefined, updatedAt: Date): void {
  const given = header?.trim().replace(/^W\//, '');
  if (!given || given !== etagOf(updatedAt)) throw new ApiError('conflict.stale_version', 412);
}
