import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { UPLOAD_RECORD_KINDS, type UploadRecordType } from '@css/shared/files';
import { volunteerWhere } from '../access/scope';
import type { AccessService, RequestAccess } from '../access/service';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import { buildPage, decodeCursor, keysetWhere, orderBy, type SortField } from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { PageMeta } from '../http/send';
import { NEAR_DUPLICATE_BITS } from '../files/images-process';
import { loadUploadRecord, scopeReachesRecord } from '../files/records';
import { type ExportDownload, exportDownload, exportFileName } from '../exports/download';
import { ApiError } from '../i18n/api-error';
import { knownBucket, NotFoundError, type StorageDriver } from '../storage';

const PHOTO_KINDS = ['profile_photo', 'nid_photo'];
/** The near duplicates looked at for the one a caller may see; enough for any real burst. */
const NEAR_DUPLICATES_CHECKED = 20;
/** Permissions through which an official reaches the person a registration photo belongs to. */
const REACHING_PERMISSIONS = [
  'volunteer.view_all',
  'registration.approve',
  'staff.registration.approve',
  // the staff list and an official's profile show the official's photo
  'permission.view',
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

/** The rows of a file list and its CSV, with the slot of the link to the record listed. */
const rowSelect = (entityType: string, entityId: string) =>
  ({
    id: true,
    kind: true,
    mime: true,
    sizeBytes: true,
    capturedAt: true,
    uploadedAt: true,
    uploadedBy: true,
    latitude: true,
    longitude: true,
    gpsAccuracyM: true,
    virusScan: true,
    flags: true,
    fileLinksFile: {
      where: { entityType, entityId },
      select: { slot: true },
      take: 1,
      orderBy: { createdAt: 'asc' },
    },
  }) as const;
type ListedFile = Prisma.FileGetPayload<{ select: ReturnType<typeof rowSelect> }>;

/** A file in the list of its record. */
export interface FileListRow {
  id: string;
  kind: string;
  slot: string | null;
  mime: string;
  sizeBytes: number;
  capturedAt: string | null;
  uploadedAt: string;
  gps: { lat: number; lng: number; accuracyM: number | null } | null;
  virusScan: string;
  flags: string[];
}

const CSV_MAX_ROWS = 5000;
const CSV_HEADER =
  'id,kind,slot,mime,size_bytes,captured_at,uploaded_at,virus_scan,flags,latitude,longitude';

/** One row; the position only for a caller with its class, or the uploader. */
function listRow(row: ListedFile, principal: Principal, access: RequestAccess): FileListRow {
  const position =
    row.latitude !== null &&
    row.longitude !== null &&
    (access.fieldClasses.has('file.location') || row.uploadedBy === principal.userId);
  return {
    id: row.id,
    kind: row.kind,
    slot: row.fileLinksFile[0]?.slot ?? null,
    mime: row.mime,
    sizeBytes: Number(row.sizeBytes),
    capturedAt: row.capturedAt?.toISOString() ?? null,
    uploadedAt: row.uploadedAt.toISOString(),
    gps: position
      ? {
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          accuracyM: row.gpsAccuracyM === null ? null : Number(row.gpsAccuracyM),
        }
      : null,
    virusScan: row.virusScan,
    flags: row.flags,
  };
}

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
 * Streams stored files to the people allowed to see them, never through a storage address
 * (x-permission `entity`; docs/architecture/FILES_AND_DOCUMENTS.md, "Access control"). Registration and profile photos:
 * their owner, and an official whose reaching permission covers the owner; the NID photo only with
 * the `volunteer.identity` class and a `volunteer.view_sensitive` scope that reaches the volunteer.
 * A file linked to a record: its uploader, and whoever holds a view permission of its kind whose
 * scope reaches the record. Everyone else gets 404 without telling which. A file the scan has not
 * cleared answers 423 (pending or failed) or 410 (infected) to those who may see it; `skipped`
 * (no scanner) is viewable outside production only. An official's view of an NID photo is audited.
 */
export class FilesService {
  constructor(
    private readonly env: Pick<Env, 'NODE_ENV' | 'CURSOR_SECRET'>,
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
    // an export file is its job's: its own checks, an expiry answered as 410, and a download name
    const exported = await exportDownload(this.prisma, this.access, principal, fileId);
    if (exported) return this.streamExport(exported, res, variant);
    const file = await this.findFile(fileId);
    const owner = await this.viewer(principal, file);
    this.refuseQuarantined(file);
    const key = variant
      ? variant === 'small'
        ? file.thumbnailSmallKey
        : file.thumbnailMediumKey
      : file.objectKey;
    if (!key) throw new ApiError('permission.not_found', 404);
    // an official opening an identity document leaves a trace (docs/security/RBAC.md,
    // "Field-level protection")
    if (file.kind === 'nid_photo' && owner && principal.userId !== owner)
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.nid_viewed',
          entityType: 'file',
          entityId: file.id,
          new: { ownerUserId: owner, ...(variant ? { variant } : {}) },
        }),
      );
    const bucket = knownBucket(file.bucket);
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

  /** An export file to its requester, as an attachment; a sensitive one's download is audited. */
  private async streamExport(
    exported: ExportDownload,
    res: Response,
    variant: FileVariant | undefined,
  ): Promise<void> {
    if (variant) throw new ApiError('permission.not_found', 404);
    const { file, job } = exported;
    let body;
    try {
      body = await this.storage.get(knownBucket(file.bucket), file.objectKey);
    } catch (error) {
      if (error instanceof NotFoundError) throw new ApiError('permission.not_found', 404);
      throw error;
    }
    // the trace of a download that is about to happen, never of one that could not
    if (job.sensitive)
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.download_sensitive',
          entityType: 'file',
          entityId: file.id,
          new: { jobId: job.id, kind: job.kind, format: job.format, rowCount: job.rowCount },
        }),
      );
    res.status(200);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(Number(file.sizeBytes)));
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(job)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(body, res);
  }

  /**
   * The metadata of a file, its scan state and its flags (also while it is quarantined), the near
   * duplicate named only when the caller reaches it. `fieldClasses` are the protected classes this
   * caller sees on this file beyond the role's: the position of the own upload (docs/security/
   * RBAC.md, "Field-level protection"). Reading an NID photo's metadata is audited as its view.
   */
  async info(
    principal: Principal,
    fileId: string,
  ): Promise<{ view: FileView; fieldClasses: string[] }> {
    const row = await this.prisma.file.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!row) throw new ApiError('permission.not_found', 404);
    const owner = await this.viewer(principal, row);
    if (row.kind === 'nid_photo' && owner && principal.userId !== owner)
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.nid_viewed',
          entityType: 'file',
          entityId: row.id,
          new: { ownerUserId: owner, metadata: true },
        }),
      );
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
      fieldClasses: row.uploadedBy === principal.userId ? ['file.location'] : [],
    };
  }

  /**
   * The files of one record, the latest upload start first (the time-ordered file id is made when
   * the upload starts; docs/architecture/FILES_AND_DOCUMENTS.md, "Access control"): the kinds whose view permission reaches the record, and the caller's own uploads to
   * it; 404 when the caller sees none of it. The position of each row only reaches a caller with
   * its class or the uploader; no row carries a key, a name or any free text.
   */
  async list(
    principal: Principal,
    query: { entityType: string; entityId: string; cursor?: string | undefined; limit: number },
  ): Promise<{ rows: FileListRow[]; meta: PageMeta }> {
    const { where, access } = await this.recordFiles(principal, query.entityType, query.entityId);
    const binding = `files.list|${principal.userId}|${query.entityType}|${query.entityId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const sort: SortField[] = [{ field: 'id', direction: 'desc' }];
    const fetched = await this.prisma.file.findMany({
      where: { AND: [where, ...(cursor ? [keysetWhere(sort, cursor)] : [])] },
      orderBy: orderBy(sort, direction),
      take: query.limit + 1,
      select: rowSelect(query.entityType, query.entityId),
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    await this.prisma.$transaction((tx) => this.auditNidRows(tx, rows, query, 'list'));
    return { rows: rows.map((row) => listRow(row, principal, access)), meta };
  }

  /**
   * The same rows as CSV, at most 5,000, newest first; every export is audited
   * (`file.list_exported`), and one with NID photos also as their view.
   */
  async exportCsv(
    principal: Principal,
    query: { entityType: string; entityId: string },
  ): Promise<string> {
    const { where, access } = await this.recordFiles(principal, query.entityType, query.entityId);
    const rows = await this.prisma.file.findMany({
      where,
      orderBy: { id: 'desc' },
      take: CSV_MAX_ROWS,
      select: rowSelect(query.entityType, query.entityId),
    });
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, {
        action: 'file.list_exported',
        entityType: query.entityType,
        entityId: query.entityId,
        new: { rows: rows.length, format: 'csv' },
      });
      await this.auditNidRows(tx, rows, query, 'csv');
    });
    const lines = rows.map((row) => {
      const view = listRow(row, principal, access);
      return [
        view.id,
        view.kind,
        view.slot,
        view.mime,
        view.sizeBytes,
        view.capturedAt ?? '',
        view.uploadedAt,
        view.virusScan,
        view.flags.join('|'),
        view.gps?.lat ?? '',
        view.gps?.lng ?? '',
      ].join(',');
    });
    return [CSV_HEADER, ...lines].join('\r\n') + '\r\n';
  }

  /**
   * Which files of a record the caller sees: the kinds whose view permission reaches it and the
   * caller's own uploads; 404 (logged) for a record type without files, a missing record, or a
   * caller who sees none of it.
   */
  private async recordFiles(principal: Principal, entityType: string, entityId: string) {
    const refuse = () => {
      this.access.denied(principal.userId, 'entity', 'file');
      return new ApiError('permission.not_found', 404);
    };
    if (!Object.hasOwn(UPLOAD_RECORD_KINDS, entityType)) throw refuse();
    const type = entityType as UploadRecordType;
    const record = await loadUploadRecord(this.prisma, type, entityId);
    if (!record) throw refuse();
    const access = await this.access.load(principal.userId);
    const kinds: string[] = [];
    for (const kind of UPLOAD_RECORD_KINDS[type])
      for (const permission of viewPermissions(kind)) {
        if (!access.grants.some((g) => g.permission === permission)) continue;
        const scope = await this.access.scopeFor(principal, access, permission, 'project');
        if (await scopeReachesRecord(this.prisma, scope, record)) {
          kinds.push(kind);
          break;
        }
      }
    const linked = { deletedAt: null, fileLinksFile: { some: { entityType, entityId } } };
    // the uploader lists their own files of a record; an application's only while they still own
    // the application, so a transfer takes them from the old volunteer with the rest of the record
    const where = {
      ...linked,
      OR: [
        { kind: { in: kinds } },
        ...(type !== 'application' || record.owners.includes(principal.userId)
          ? [{ uploadedBy: principal.userId }]
          : []),
      ],
    };
    if (!kinds.length && !(await this.prisma.file.count({ where }))) throw refuse();
    return { where, access };
  }

  /** A list or export that holds NID photos leaves the trace of their view. */
  private async auditNidRows(
    tx: Tx,
    rows: { id: string; kind: string }[],
    query: { entityType: string; entityId: string },
    format: 'list' | 'csv',
  ): Promise<void> {
    const nid = rows.filter((row) => row.kind === 'nid_photo').map((row) => row.id);
    if (!nid.length) return;
    await this.audit.record(tx, {
      action: 'file.nid_viewed',
      entityType: query.entityType,
      entityId: query.entityId,
      new: { fileIds: nid, format },
    });
  }

  private async findFile(fileId: string): Promise<StoredFile> {
    // a deleted file is gone for everyone
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
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
    // an export file belongs to its job, whose own checks decide who reads it
    if (file.kind === 'export') {
      await exportDownload(this.prisma, this.access, principal, file.id);
      return null;
    }
    // a photo on an application (a beneficiary's NID photo, say) follows the application, never
    // the registration rule of a volunteer's own photos
    const onApplication =
      (await this.prisma.fileLink.count({
        where: { fileId: file.id, entityType: 'application' },
      })) > 0;
    const registration = PHOTO_KINDS.includes(file.kind) && !onApplication;
    const owner = registration ? await this.ownerOf(file) : null;
    const allowed = registration
      ? !!owner && (await this.mayViewPhoto(principal, owner, file.kind))
      : await this.mayViewLinked(principal, file);
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

  private async mayViewLinked(
    principal: Principal,
    file: StoredFile,
    loaded?: RequestAccess,
  ): Promise<boolean> {
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
    // the uploader reads their own file; one of an application only while they still own the
    // application, so a transfer takes it from the old volunteer with the rest of the record
    if (
      file.uploadedBy === principal.userId &&
      (!links.some((l) => l.entityType === 'application') ||
        records.some((r) => r.applicationId && r.owners.includes(principal.userId)))
    )
      return true;
    if (!records.length) return false;
    const access = loaded ?? (await this.access.load(principal.userId));
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
       ORDER BY uploaded_at
       LIMIT ${NEAR_DUPLICATES_CHECKED}`;
    if (!near.length) return null;
    const access = await this.access.load(principal.userId);
    for (const other of near) {
      const stored = await this.findFile(other.id);
      if (await this.mayViewLinked(principal, stored, access)) return other.id;
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

/**
 * Images and PDF open in the browser; anything else is a download. The name is the file id with
 * the type's extension: the uploader's own file name is never stored or sent.
 */
function disposition(type: string, fileId: string): string {
  if (type.startsWith('image/') || type === 'application/pdf') return 'inline';
  return `attachment; filename="${fileId}"`;
}
