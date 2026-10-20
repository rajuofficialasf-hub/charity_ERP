import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { UPLOAD_RECORD_KINDS, type UploadRecordType } from '@css/shared/files';
import { volunteerWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import type { PrismaService } from '../core/prisma.service';
import { NEAR_DUPLICATE_BITS } from '../files/images-process';
import { loadUploadRecord, scopeReachesRecord } from '../files/records';
import { ApiError } from '../i18n/api-error';
import { BUCKETS, NotFoundError, type StorageDriver } from '../storage';

const PHOTO_KINDS = ['profile_photo', 'nid_photo'];
/** Permissions through which an official reaches the person a registration photo belongs to. */
const REACHING_PERMISSIONS = [
  'volunteer.view_all',
  'registration.approve',
  'staff.registration.approve',
] as const;

/**
 * The permissions whose scope must reach the record a file links to: the money papers to those
 * who review applications or view the budget (never the Media Team), documents to the register's
 * readers, photos to those who view applications; whoever may upload to the record sees its files.
 */
function viewPermissions(kind: string): string[] {
  switch (kind) {
    case 'voucher':
    case 'payment_copy':
      return ['application.review', 'budget.view', 'file.upload'];
    case 'document':
      return ['document.register.view', 'file.upload'];
    default:
      return ['application.view', 'file.upload'];
  }
}

export type FileVariant = 'small' | 'medium';

/** A file as the caller may see it; the position only reaches a caller with its class or the uploader. */
export interface FileView {
  id: string;
  kind: string;
  mime: string;
  sizeBytes: number;
  capturedAt: string | null;
  uploadedAt: string;
  gps: { lat: number; lng: number; accuracyM: number | null } | null;
  virusScan: string;
  flags: string[];
  duplicateOf: string | null;
}

interface StoredFile {
  id: string;
  bucket: string;
  objectKey: string;
  kind: string;
  mime: string;
  sizeBytes: bigint;
  uploadedBy: string | null;
  virusScan: string;
  thumbnailSmallKey: string | null;
  thumbnailMediumKey: string | null;
}

/**
 * Streams stored files to the people allowed to see them (x-permission `entity`; NS-10, NS-41;
 * docs/architecture/FILES_AND_DOCUMENTS.md, "Access control"). Registration and profile photos:
 * their owner, and an official whose reaching permission covers the owner; the NID photo only with
 * the `volunteer.identity` class and a `volunteer.view_sensitive` scope that reaches the volunteer.
 * A file linked to a record: its uploader, and whoever holds a view permission of its kind whose
 * scope reaches the record. Everyone else gets 404 without telling which. A file the scan has not
 * cleared answers 423 (pending or failed) or 410 (infected) to those who may see it; `skipped`
 * (no scanner) is viewable outside production only. An official's view of an NID photo is audited.
 */
export class FilesService {
  constructor(
    private readonly env: Pick<Env, 'NODE_ENV'>,
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly access: AccessService,
    private readonly audit: AuditWriter,
  ) {}

  async streamContent(
    principal: Principal,
    fileId: string,
    res: Response,
    variant?: FileVariant,
  ): Promise<void> {
    const file = await this.findFile(fileId);
    const owner = await this.viewer(principal, file);
    this.refuseQuarantined(file);
    const key = variant
      ? variant === 'small'
        ? file.thumbnailSmallKey
        : file.thumbnailMediumKey
      : file.objectKey;
    if (!key) throw new ApiError('permission.not_found', 404);
    // An official opening an identity document leaves a trace (RBAC.md 6).
    if (file.kind === 'nid_photo' && owner && principal.userId !== owner)
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.nid_viewed',
          entityType: 'file',
          entityId: file.id,
          new: { ownerUserId: owner, ...(variant ? { variant } : {}) },
        }),
      );
    const bucket = bucketOf(file);
    let body;
    let size: number;
    try {
      if (variant) {
        const stat = await this.storage.stat(bucket, key);
        if (!stat) throw new NotFoundError(bucket, key);
        size = stat.size;
      } else size = Number(file.sizeBytes);
      body = await this.storage.get(bucket, key);
    } catch (error) {
      if (error instanceof NotFoundError) throw new ApiError('permission.not_found', 404);
      throw error;
    }
    const type = variant ? 'image/jpeg' : file.mime;
    res.status(200);
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', disposition(type, file.id));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(body, res);
  }

  /**
   * The metadata of a file, its scan state and its flags (also while it is quarantined), the near
   * duplicate named only when the caller reaches it; `ownUpload` lets the route show the uploader
   * the position of the own file.
   */
  async info(
    principal: Principal,
    fileId: string,
  ): Promise<{ view: FileView; ownUpload: boolean }> {
    const file = await this.findFile(fileId);
    await this.viewer(principal, file);
    const row = await this.prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    return {
      view: {
        id: row.id,
        kind: row.kind,
        mime: row.mime,
        sizeBytes: Number(row.sizeBytes),
        capturedAt: row.capturedAt?.toISOString() ?? null,
        uploadedAt: row.uploadedAt.toISOString(),
        gps:
          row.latitude !== null && row.longitude !== null
            ? {
                lat: Number(row.latitude),
                lng: Number(row.longitude),
                accuracyM: row.gpsAccuracyM === null ? null : Number(row.gpsAccuracyM),
              }
            : null,
        virusScan: row.virusScan,
        flags: row.flags,
        duplicateOf: row.flags.includes('duplicate_suspect')
          ? await this.nearDuplicateInReach(principal, row)
          : null,
      },
      ownUpload: row.uploadedBy === principal.userId,
    };
  }

  private async findFile(fileId: string): Promise<StoredFile> {
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
        virusScan: true,
        thumbnailSmallKey: true,
        thumbnailMediumKey: true,
      },
    });
    if (!file) throw new ApiError('permission.not_found', 404);
    return file;
  }

  /**
   * Whether the caller may see the file, or 404 (logged as a refusal). Answers the owner of a
   * registration photo, which the NID audit names.
   */
  private async viewer(principal: Principal, file: StoredFile): Promise<string | null> {
    let owner: string | null = null;
    let allowed = false;
    if (PHOTO_KINDS.includes(file.kind)) {
      owner = await this.ownerOf(file);
      allowed = !!owner && (await this.mayViewPhoto(principal, owner, file.kind));
    } else allowed = await this.mayViewLinked(principal, file);
    if (!allowed) {
      this.access.denied(principal.userId, 'entity', 'file');
      throw new ApiError('permission.not_found', 404);
    }
    return owner;
  }

  /** 423 while the scan has not cleared the file, 410 once it found a threat. */
  private refuseQuarantined(file: StoredFile): void {
    if (file.virusScan === 'clean') return;
    if (file.virusScan === 'skipped' && this.env.NODE_ENV !== 'production') return;
    if (file.virusScan === 'infected') throw new ApiError('file.infected', 410);
    throw new ApiError('file.quarantined', 423);
  }

  private async mayViewLinked(principal: Principal, file: StoredFile): Promise<boolean> {
    if (file.uploadedBy === principal.userId) return true;
    const links = await this.prisma.fileLink.findMany({
      where: { fileId: file.id },
      select: { entityType: true, entityId: true },
    });
    const records = [];
    for (const link of links) {
      if (!Object.hasOwn(UPLOAD_RECORD_KINDS, link.entityType)) continue;
      const record = await loadUploadRecord(
        this.prisma,
        link.entityType as UploadRecordType,
        link.entityId,
      );
      if (record) records.push(record);
    }
    if (!records.length) return false;
    const access = await this.access.load(principal.userId);
    for (const permission of viewPermissions(file.kind)) {
      if (!access.grants.some((g) => g.permission === permission)) continue;
      const scope = await this.access.scopeFor(principal, access, permission, 'project');
      for (const record of records)
        if (await scopeReachesRecord(this.prisma, scope, record)) return true;
    }
    return false;
  }

  /** The near duplicate of a flagged photo in its project, when the caller may see that file. */
  private async nearDuplicateInReach(
    principal: Principal,
    file: { id: string; projectId: string | null; phash: bigint | null },
  ): Promise<string | null> {
    if (!file.projectId || file.phash === null) return null;
    const near = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM files
       WHERE project_id = ${file.projectId}::uuid AND id <> ${file.id}::uuid
         AND phash IS NOT NULL AND deleted_at IS NULL
         AND bit_count((phash # ${file.phash})::bit(64)) <= ${NEAR_DUPLICATE_BITS}
       ORDER BY uploaded_at`;
    for (const other of near) {
      const stored = await this.findFile(other.id);
      if (await this.mayViewLinked(principal, stored)) return other.id;
    }
    return null;
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

  private async mayViewPhoto(
    principal: Principal,
    ownerId: string,
    kind: string,
  ): Promise<boolean> {
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

function bucketOf(file: StoredFile) {
  const bucket = BUCKETS.find((b) => b === file.bucket);
  if (!bucket) throw new Error(`file ${file.id} names an unknown bucket`);
  return bucket;
}

/**
 * Images and PDF open in the browser; anything else is a download. The name is the file id with
 * the type's extension: the uploader's own file name is never stored or sent.
 */
function disposition(type: string, fileId: string): string {
  if (type.startsWith('image/') || type === 'application/pdf') return 'inline';
  return `attachment; filename="${fileId}"`;
}
