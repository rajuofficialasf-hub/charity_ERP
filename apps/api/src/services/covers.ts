import { uuidv7 } from '@css/shared';
import { COVER_SLOT, COVER_UPLOAD_SLOT, type CoverRecordType } from '@css/shared/files';
import type { Scope } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import { loadCoverRecord, scopeReachesCover } from '../files/records.js';
import { ApiError } from '../i18n/api-error.js';

/**
 * The cover photos of programs and project series (docs/architecture/FILES_AND_DOCUMENTS.md,
 * "Cover photos"). A cover is never a column: it is the link of `file_links` with the slot
 * `cover` on its record. A photo arrives through the chunked upload under the slot
 * `cover_upload` and becomes the cover only when it is set here, which moves the record's one
 * `cover` link to it; the earlier photo keeps its file and the link it was uploaded under.
 */

/** The file ids of the covers of the given records, by record; a record without one is left out. */
export async function coverFileIds(
  db: PrismaService | Tx,
  type: CoverRecordType,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const links = await db.fileLink.findMany({
    where: { entityType: type, slot: COVER_SLOT, entityId: { in: [...ids] } },
    select: { entityId: true, fileId: true },
  });
  return new Map(links.map((l) => [l.entityId, l.fileId]));
}

/** The caller of a cover route: who it is and what the route's scope (entity program) reaches. */
export interface CoverViewer {
  principal: Principal;
  scope: Scope;
}

export class CoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
  ) {}

  /**
   * Sets the cover of a program or a project series the route's scope reaches (404 otherwise, as
   * a record that does not exist). The program of a series is the one it is stored with. The file
   * must be a finished cover upload of the caller for this very record, linked to nothing else
   * (422 otherwise, whichever of these fails, so the answer tells nothing of another person's
   * file). The change is audited with the earlier and the new file.
   */
  async set(
    viewer: CoverViewer,
    type: CoverRecordType,
    id: string,
    fileId: string,
  ): Promise<{ coverFileId: string }> {
    const actor = viewer.principal.userId;
    return this.prisma.$transaction(async (tx) => {
      const record = await loadCoverRecord(tx, type, id);
      if (!record || !(await scopeReachesCover(tx, viewer.scope, record))) {
        this.access.denied(actor, viewer.scope.permission, type);
        throw new ApiError('permission.not_found', 404);
      }
      // one change of a record's cover at a time, so its one link is moved or made once
      if (type === 'program')
        await tx.$queryRaw`SELECT id FROM programs WHERE id = ${id}::uuid FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM project_series WHERE id = ${id}::uuid FOR UPDATE`;
      const file = await tx.file.findFirst({
        where: { id: fileId, deletedAt: null },
        select: {
          kind: true,
          uploadedBy: true,
          fileLinksFile: { select: { entityType: true, entityId: true, slot: true } },
        },
      });
      const ofRecord = (l: { entityType: string; entityId: string }) =>
        l.entityType === type && l.entityId === id;
      const usable =
        file !== null &&
        file.kind === 'cover_photo' &&
        file.uploadedBy === actor &&
        file.fileLinksFile.some((l) => ofRecord(l) && l.slot === COVER_UPLOAD_SLOT) &&
        file.fileLinksFile.every(ofRecord);
      if (!usable) throw new ApiError('file.cover_invalid', 422);
      const before = await tx.fileLink.findFirst({
        where: { entityType: type, entityId: id, slot: COVER_SLOT },
        select: { id: true, fileId: true },
      });
      // the link is moved, never removed: the earlier photo stays a file with its upload link
      if (before)
        await tx.fileLink.update({ where: { id: before.id }, data: { fileId, updatedBy: actor } });
      else
        await tx.fileLink.create({
          data: {
            id: uuidv7(),
            fileId,
            entityType: type,
            entityId: id,
            slot: COVER_SLOT,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      await this.audit.record(tx, {
        action: `${type}.cover_changed`,
        entityType: type,
        entityId: id,
        old: { coverFileId: before?.fileId ?? null },
        new: { coverFileId: fileId },
      });
      return { coverFileId: fileId };
    });
  }
}
