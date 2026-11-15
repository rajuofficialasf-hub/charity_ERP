import { STARTING_NAME_VARIANT_GROUPS } from '@css/shared/beneficiaries';
import { type SeedContext, seedId } from '../../context.js';

/**
 * The spelling variants the name keys start with (docs/database/DATABASE_SCHEMA.md,
 * "name_variant_groups"): each group's first spelling is the one its other spellings are made
 * equal to. Written once: a later run keeps what officials changed (a group switched off, a
 * spelling taken out or moved). When a run adds a spelling, the version of the list is raised in
 * the same transaction, so keys computed before it are computed again by the key job.
 */
export async function seedNameVariants(ctx: SeedContext): Promise<void> {
  let added = 0;
  for (const [canonical, ...others] of STARTING_NAME_VARIANT_GROUPS) {
    const groupId = seedId(`name-variant-group:${canonical!}`);
    await ctx.upsert(
      'name_variant_groups',
      { id: groupId, canonical: canonical!, ...ctx.audit() },
      { insertOnly: ['canonical', 'updated_by'] },
    );
    for (const variant of [canonical!, ...others]) {
      const outcome = await ctx.upsert(
        'name_variants',
        { id: seedId(`name-variant:${variant}`), group_id: groupId, variant, ...ctx.audit() },
        { insertOnly: ['group_id', 'variant', 'updated_by'] },
      );
      if (outcome === 'inserted') added++;
    }
  }
  if (added)
    await ctx.db.$executeRaw`
      UPDATE name_variants_version SET version = version + 1, updated_by = ${ctx.actorId}::uuid
      WHERE id = 1`;
}
