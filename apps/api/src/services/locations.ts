import type { Bilingual } from '@css/shared/i18n';
import type { PrismaService } from '../core/prisma.service';

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
