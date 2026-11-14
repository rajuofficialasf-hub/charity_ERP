import { startingNameVariantRows } from '@css/shared/beneficiaries';
import { type SeedContext, seedId } from '../../context.js';

/**
 * The spelling variants the name keys start with (docs/database/DATABASE_SCHEMA.md,
 * "name_variants"): every spelling of a group points to the group's first one. Written once: a
 * later run keeps what officials changed. When a run adds a spelling, the version of the list is
 * raised in the same transaction, so keys computed before it are computed again by the key job.
 */
export async function seedNameVariants(ctx: SeedContext): Promise<void> {
  let added = 0;
  for (const { variant, canonical } of startingNameVariantRows()) {
    const outcome = await ctx.upsert(
      'name_variants',
      { id: seedId(`name-variant:${variant}`), variant, canonical, ...ctx.audit() },
      { key: ['variant'], insertOnly: ['id', 'canonical', 'updated_by'] },
    );
    if (outcome === 'inserted') added++;
  }
  if (added)
    await ctx.db.$executeRaw`
      UPDATE name_variants_version SET version = version + 1, updated_by = ${ctx.actorId}::uuid
      WHERE id = 1`;
}
