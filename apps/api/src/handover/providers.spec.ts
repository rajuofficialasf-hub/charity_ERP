import { describe, expect, it } from 'vitest';
import type { Tx } from '../core/prisma.service';
import {
  HANDOVER_PROVIDERS,
  type HandoverItem,
  type HandoverItemType,
  pickItems,
} from './providers';

const item = (itemId: string, itemType: HandoverItemType = 'project_area'): HandoverItem => ({
  category: 'projects',
  itemType,
  itemId,
  projectId: null,
  label: itemId,
  requiredRole: 'regional_program_manager',
});

describe('handover providers', () => {
  it('reassign-all picks every listed item; named items must be listed', () => {
    const pending = [item('a'), item('b'), item('c', 'program')];
    expect(pickItems(pending, undefined)).toEqual(pending);
    expect(pickItems(pending, [{ itemType: 'project_area', itemId: 'b' }])).toEqual([item('b')]);
    expect(() => pickItems(pending, [{ itemType: 'program', itemId: 'a' }])).toThrow();
    expect(() => pickItems(pending, [{ itemType: 'project_area', itemId: 'z' }])).toThrow();
  });

  it('the modules that do not exist yet list nothing', async () => {
    const empty = HANDOVER_PROVIDERS.filter((p) =>
      ['pending_review', 'document', 'issue', 'followup'].includes(p.itemType),
    );
    expect(empty).toHaveLength(4);
    for (const p of empty) expect(await p.list({} as Tx, 'user')).toEqual([]);
  });
});
