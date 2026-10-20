import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { volunteerWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { PrismaService } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import { type Bucket, NotFoundError, type StorageDriver } from '../storage';

const PHOTO_KINDS = ['profile_photo', 'nid_photo'];
/** Permissions through which an official reaches the person a photo belongs to. */
const REACHING_PERMISSIONS = [
  'volunteer.view_all',
  'registration.approve',
  'staff.registration.approve',
] as const;

/**
 * Streams stored files to the people allowed to see them (x-permission `entity`, D-087; NS-10,
 * NS-41). So far the registration and profile photos: their owner sees them (the NID photo too,
 * D-081); an official sees them when one of the reaching permissions covers the owner, and the NID
 * photo only with the `volunteer.identity` field class and a `volunteer.view_sensitive` scope that
 * reaches the volunteer (D-094). Everyone else, and a photo of an
 * unsubmitted draft, gets 404 without telling which. An official's view of an NID photo is
 * audited (`file.nid_viewed`).
 */
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
  ) {}

  async streamContent(principal: Principal, fileId: string, res: Response): Promise<void> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        kind: true,
        mime: true,
        sizeBytes: true,
        uploadedBy: true,
      },
    });
    const owner = file && PHOTO_KINDS.includes(file.kind) ? await this.ownerOf(file) : null;
    if (!file || !owner || !(await this.mayView(principal, owner, file.kind))) {
      this.access.denied(principal.userId, 'entity', 'file');
      throw new ApiError('permission.not_found', 404);
    }
    // An official opening an identity document leaves a trace (R15; RBAC.md 6).
    if (file.kind === 'nid_photo' && principal.userId !== owner)
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.nid_viewed',
          entityType: 'file',
          entityId: file.id,
          new: { ownerUserId: owner },
        }),
      );
    let body;
    try {
      body = await this.storage.get(file.bucket as Bucket, file.objectKey);
    } catch (error) {
      if (error instanceof NotFoundError) throw new ApiError('permission.not_found', 404);
      throw error;
    }
    res.status(200);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(body, res);
  }

  /** The user a photo belongs to: the volunteer profile, the staff link, or the uploader. */
  private async ownerOf(file: { id: string; uploadedBy: string | null }): Promise<string | null> {
    const volunteer = await this.prisma.volunteer.findFirst({
      where: {
        OR: [
          { photoFileId: file.id },
          { nidPhotoFileId: file.id },
          { nidPhotoBackFileId: file.id },
        ],
      },
      select: { userId: true },
    });
    if (volunteer) return volunteer.userId;
    const link = await this.prisma.fileLink.findFirst({
      where: { fileId: file.id, entityType: 'user' },
      select: { entityId: true },
    });
    return link?.entityId ?? file.uploadedBy;
  }

  private async mayView(principal: Principal, ownerId: string, kind: string): Promise<boolean> {
    if (principal.userId === ownerId) return true;
    const access = await this.access.load(principal.userId);
    if (kind === 'nid_photo') {
      // an identity document follows the per-record rule of the profile (DECISION_LOG D-094): the
      // class and a `volunteer.view_sensitive` scope that reaches this volunteer
      if (!access.fieldClasses.has('volunteer.identity')) return false;
      const scope = await this.access.sensitiveScope(
        principal,
        access,
        'volunteer.view_sensitive',
        'volunteer',
      );
      if (!scope) return false;
      const reached = await this.prisma.volunteer.count({
        where: { AND: [{ userId: ownerId }, volunteerWhere(scope)] },
      });
      return reached > 0;
    }
    for (const permission of REACHING_PERMISSIONS) {
      if (!access.grants.some((g) => g.permission === permission)) continue;
      const scope = await this.access.scopeFor(principal, access, permission, 'user');
      const reached = await this.prisma.user.count({
        where: { AND: [{ id: ownerId }, this.access.userFilter(scope)] },
      });
      if (reached) return true;
    }
    return false;
  }
}
