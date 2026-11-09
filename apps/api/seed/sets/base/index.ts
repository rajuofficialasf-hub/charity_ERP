import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type LocationRow } from '../../../src/locations/convert';
import { parseCsvRecords } from '../../../src/locations/csv';
import { loadLocations } from '../../../src/locations/load';
import { type SeedContext, seedId } from '../../context';
import { inTransaction, REPO_ROOT } from '../util';
import { seedAccess } from './access';
import { seedNotificationTemplates } from './notifications';
import { seedReferenceLists } from './reference-lists';
import { seedSettings } from './settings';
import { seedWorkflows } from './workflows';

export const SYSTEM_ACTOR_ID = seedId('user:system');

/**
 * Base set: reference data every development and test database needs (TEST_STRATEGY section 4):
 * the system actor, locations, reference lists, the system settings, roles and permissions, workflow definitions,
 * notification templates and the form library with the two current forms (appendix খ).
 */
export async function seedBase(ctx: SeedContext): Promise<void> {
  await inTransaction(ctx.db, async () => {
    // The system actor writes job and seed rows (DATABASE_SCHEMA section 3); it cannot log in.
    await ctx.upsert('users', {
      id: SYSTEM_ACTOR_ID,
      kind: 'system',
      display_name: 'System',
      state: 'active',
    });
    ctx.actorId = SYSTEM_ACTOR_ID;
  });
  const csv = readFileSync(join(REPO_ROOT, 'docs/source/data/bd-locations.csv'), 'utf8');
  const locations = await loadLocations(ctx.db, parseCsvRecords(csv) as LocationRow[]);
  ctx.counts.set('locations', {
    inserted: locations.inserted,
    updated: locations.updated,
    unchanged: locations.unchanged,
  });
  await inTransaction(ctx.db, async () => {
    await seedReferenceLists(ctx);
    await seedSettings(ctx);
    await seedAccess(ctx);
    await seedWorkflows(ctx);
    await seedNotificationTemplates(ctx);
  });
}
