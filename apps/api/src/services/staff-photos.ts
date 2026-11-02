import type { PrismaService, Tx } from '../core/prisma.service';

/**
 * The uploaded photos of officials by user id. An official's photo is the file link of the user
 * (slot `photo`); a person without one is left out of the map, and the screens show the initial.
 */
export async function staffPhotos(
  prisma: PrismaService | Tx,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const links = await prisma.fileLink.findMany({
    where: { entityType: 'user', slot: 'photo', entityId: { in: [...userIds] } },
    select: { entityId: true, fileId: true },
  });
  return new Map(links.map((l) => [l.entityId, l.fileId]));
}
