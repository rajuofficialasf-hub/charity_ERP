import type { Bilingual } from '@css/shared/i18n';
import type { PrismaService, Tx } from '../core/prisma.service';

export interface LocationView {
  id: string;
  parentId: string | null;
  level: string;
  code: string;
  name: Bilingual;
  active: boolean;
}

/** The locations master as reference data (O-09; public list of DECISION_LOG D-083). */
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active children of `parentId`, or the active divisions; ordered by code (BBS order). */
  async children(parentId: string | undefined): Promise<LocationView[]> {
    const rows = await this.prisma.location.findMany({
      where: { parentId: parentId ?? null, active: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        parentId: true,
        level: true,
        code: true,
        nameBn: true,
        nameEn: true,
        active: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      level: r.level,
      code: r.code,
      name: { bn: r.nameBn, en: r.nameEn },
      active: r.active,
    }));
  }
}

/** The four levels of an address, top down. */
export const ADDRESS_LEVELS = ['division', 'district', 'upazila', 'union'] as const;

/**
 * Whether four location ids form one chain: a division, a district in it, an upazila in that
 * district and a union in that upazila, all active.
 */
export async function isAddressChain(db: Tx, ids: readonly string[]): Promise<boolean> {
  if (ids.length !== ADDRESS_LEVELS.length) return false;
  const rows = await db.location.findMany({
    where: { id: { in: [...ids] }, active: true },
    select: { id: true, parentId: true, level: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.every((id, i) => {
    const row = byId.get(id);
    // eslint-disable-next-line security/detect-object-injection -- index of a fixed list
    return !!row && row.level === ADDRESS_LEVELS[i] && (i === 0 || row.parentId === ids[i - 1]);
  });
}
