import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import type { Container } from '../../../src/container.js';
import { raiseVariantsVersion } from '../../../src/services/match-keys.js';

/**
 * Stores the name keys of profiles the fixtures inserted directly, as every service write of a
 * name or a village does; the comparisons of people read only the stored keys.
 */
export function storeKeys(c: Pick<Container, 'prisma' | 'matchKeys'>, ids: readonly string[]) {
  return c.prisma.$transaction((tx) => c.matchKeys.refreshProfiles(tx, ids));
}

/**
 * Adds one group of spelling variants (its first spelling the group's own) and raises the list's
 * version, as a change in the settings does; the keys stored before it are older then.
 */
export async function addVariantGroup(
  db: Client,
  c: Pick<Container, 'prisma' | 'jobs'>,
  spellings: readonly [string, ...string[]],
  actorId: string,
): Promise<void> {
  const groupId = randomUUID();
  await db.query('INSERT INTO name_variant_groups (id, canonical) VALUES ($1, $2)', [
    groupId,
    spellings[0],
  ]);
  for (const variant of spellings)
    await db.query('INSERT INTO name_variants (id, group_id, variant) VALUES ($1, $2, $3)', [
      randomUUID(),
      groupId,
      variant,
    ]);
  await c.prisma.$transaction((tx) => raiseVariantsVersion(tx, c.jobs, actorId));
}
