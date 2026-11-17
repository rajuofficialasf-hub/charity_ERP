import { REFERENCE_LISTS, referenceEntryId } from '../../../src/services/reference-lists-sync.js';
import { json, type SeedContext } from '../../context.js';

export { REFERENCE_LISTS };

/**
 * The shipped reference lists, written as they are in a development or test database
 * (`src/services/reference-lists-sync.ts` holds them, and the sync of `pnpm db:migrate` adds the
 * missing ones to a database with real data).
 */
export async function seedReferenceLists(ctx: SeedContext): Promise<void> {
  for (const [listKey, entries] of Object.entries(REFERENCE_LISTS)) {
    for (const [index, [code, bn, en, extra]] of entries.entries()) {
      await ctx.upsert('reference_lists', {
        id: referenceEntryId(listKey, code),
        list_key: listKey,
        code,
        label_bn: bn,
        label_en: en,
        active: true,
        sort_order: index + 1,
        is_system: extra?.system ?? false,
        attributes: json(extra?.attributes ?? {}),
        ...ctx.audit(),
      });
    }
  }
}
