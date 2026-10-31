import type { LocationView } from '@css/shared';
import type { PrismaService, Tx } from '../core/prisma.service';

export type { LocationView };

const VIEW = {
  id: true,
  parentId: true,
  level: true,
  code: true,
  nameBn: true,
  nameEn: true,
  active: true,
} as const;

const toView = (r: {
  id: string;
  parentId: string | null;
  level: string;
  code: string;
  nameBn: string;
  nameEn: string;
  active: boolean;
}): LocationView => ({
  id: r.id,
  parentId: r.parentId,
  level: r.level,
  code: r.code,
  name: { bn: r.nameBn, en: r.nameEn },
  active: r.active,
});

/** The locations master as reference data (O-09; public list of DECISION_LOG D-083). */
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every active row, top level first and by code within a level, for the phone's offline copy. */
  async all(): Promise<LocationView[]> {
    const rows = await this.prisma.location.findMany({
      where: { active: true },
      select: VIEW,
    });
    const rank = (level: string) =>
      ADDRESS_LEVELS.indexOf(level as (typeof ADDRESS_LEVELS)[number]);
    return rows
      .map(toView)
      .sort((a, b) => rank(a.level) - rank(b.level) || a.code.localeCompare(b.code));
  }

  /**
   * Changes with any change of any row: the loader bumps a row's version on every rename, move,
   * deactivation or return, so the count of rows and the sum of their versions move with it.
   */
  async version(): Promise<string> {
    const totals = await this.prisma.location.aggregate({
      _count: { id: true },
      _sum: { version: true },
    });
    return `${totals._count.id}.${(totals._sum.version ?? 0).toString(36)}`;
  }

  /** Active children of `parentId`, or the active divisions; ordered by code (BBS order). */
  async children(parentId: string | undefined): Promise<LocationView[]> {
    const rows = await this.prisma.location.findMany({
      where: { parentId: parentId ?? null, active: true },
      orderBy: { code: 'asc' },
      select: VIEW,
    });
    return rows.map(toView);
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
