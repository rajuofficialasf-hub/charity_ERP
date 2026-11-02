import { uuidv7 } from '@css/shared';
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

/**
 * Links a new photo to an official: their link is moved to the new file (the API role cannot
 * delete rows), so the earlier photo stays with the draft or request that brought it (BD-46).
 */
export async function linkStaffPhoto(tx: Tx, userId: string, fileId: string): Promise<void> {
  const moved = await tx.fileLink.updateMany({
    where: { entityType: 'user', entityId: userId, slot: 'photo' },
    data: { fileId },
  });
  if (moved.count === 0)
    await tx.fileLink.create({
      data: { id: uuidv7(), fileId, entityType: 'user', entityId: userId, slot: 'photo' },
    });
}
