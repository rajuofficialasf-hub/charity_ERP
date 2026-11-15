import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type LocationRow } from '../../../src/locations/convert.js';
import { parseCsvRecords } from '../../../src/locations/csv.js';
import { loadLocations } from '../../../src/locations/load.js';
import { type SeedContext, seedId } from '../../context.js';
import { REPO_ROOT } from '../util.js';
import { seedAccess } from './access.js';
import { seedNotificationTemplates } from './notifications.js';
import { seedNameVariants } from './name-variants.js';
import { seedReferenceLists } from './reference-lists.js';
import { seedSettings } from './settings.js';
import { seedWorkflows } from './workflows.js';

export const SYSTEM_ACTOR_ID = seedId('user:system');

/**
 * Base set: reference data every development and test database needs
 * (docs/testing/TEST_STRATEGY.md, "Test data strategy"): the system actor, locations, reference
 * lists, the system settings, roles and permissions, workflow definitions, notification templates
 * and the form library with the two current forms (appendix খ).
 */
export async function seedBase(ctx: SeedContext): Promise<void> {
  await ctx.transaction(async () => {
    // The system actor writes job and seed rows (docs/database/DATABASE_SCHEMA.md, "Audit columns
    // and the system actor"); it cannot log in.
    await ctx.upsert('users', {
      id: SYSTEM_ACTOR_ID,
      kind: 'system',
      display_name: 'System',
      state: 'active',
    });
    ctx.actorId = SYSTEM_ACTOR_ID;
  });
  const csv = readFileSync(join(REPO_ROOT, 'docs/source/data/bd-locations.csv'), 'utf8');
  const locations = await loadLocations(ctx.prisma, parseCsvRecords(csv) as LocationRow[]);
  ctx.counts.set('locations', {
    inserted: locations.inserted,
    updated: locations.updated,
    unchanged: locations.unchanged,
  });
  await ctx.transaction(async () => {
    await seedReferenceLists(ctx);
    await seedNameVariants(ctx);
    await seedSettings(ctx);
    await seedAccess(ctx);
    await seedWorkflows(ctx);
    await seedNotificationTemplates(ctx);
  });
}
