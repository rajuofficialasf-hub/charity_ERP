import type { PrismaService } from '../core/prisma.service';

/** The names of locations by id in the file's language; an unknown id has no entry. */
export async function placeNames(
  prisma: PrismaService,
  ids: readonly string[],
  locale: 'bn' | 'en',
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.location.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, nameBn: true, nameEn: true },
  });
  return new Map(rows.map((l) => [l.id, locale === 'en' ? l.nameEn : l.nameBn]));
}
