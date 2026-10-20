import type { Logger } from 'pino';
import { z } from 'zod';
import { uuidv7 } from '@css/shared';
import {
  type FileType,
  kindAllowedOn,
  maxSizeOf,
  sameFileType,
  UPLOAD_RECORD_KINDS,
  UPLOAD_RULES,
  type UploadRecordType,
  type UploadSessionCreate,
  uploadSessionCreateSchema,
} from '@css/shared/files';
import type { AccessService } from '../access/service';
import type { Scope } from '../access/scope';
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import { dropParts, joinParts, partCount, storePart } from '../files/parts';
import { bucketOf, detectType, MAGIC_LENGTH, objectKeyOf } from '../files/policy';
import { loadUploadRecord, scopeReachesRecord, type UploadRecord } from '../files/records';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { Bucket, StorageDriver } from '../storage';

/** An upload in progress, as the client resumes it. */
export interface UploadSessionView {
  id: string;
  chunkSize: number;
  partCount: number;
  partsReceived: number[];
  bytesReceived: number;
  expiresAt: string;
  fileId: string | null;
}

/** A stored file as the uploader sees it right after the upload (the position is not echoed). */
export interface UploadedFileView {
  id: string;
  kind: string;
  mime: string;
  sizeBytes: number;
  capturedAt: string | null;
  uploadedAt: string;
  virusScan: string;
  flags: string[];
  /** Named by the file routes once the processing job finds a near duplicate; empty here. */
  duplicateOf: string | null;
}

/** A result, and whether it repeats what an earlier request with the same client id made. */
export interface Replayable<T> {
  value: T;
  replay: boolean;
}

/** What a session keeps of its create request, with the file id chosen then. */
const declaredSchema = uploadSessionCreateSchema.extend({ fileId: z.uuid() });
type Declared = z.infer<typeof declaredSchema>;

interface SessionRow {
  id: string;
  partCount: number;
  partsReceived: number[];
  bytesReceived: bigint;
  expiresAt: Date;
  finalizedFileId: string | null;
}

/** Projects that still take files: running, or closing while the last documents arrive. */
const OPEN_PROJECT = new Set(['active', 'closing']);
/** A finalize waits this long for another finalize of the session, and may run this long. */
const FINALIZE_WAIT_MS = 10_000;
const FINALIZE_TIMEOUT_MS = 120_000;

/**
 * Uploads through the API in 256 KB parts (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload
 * pipeline"): a session checked against the record the file links to, the parts with a status for
 * resuming, and a finalize that checks the record again, the size, the SHA-256 and the type of the
 * joined bytes, refuses the same bytes twice in a project, and writes the file, its link and the
 * audit entry in one transaction. The file stays quarantined until the scan clears it.
 */
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** A new session, or the one an earlier create with the same client id made (`replay`). */
  async create(
    principal: Principal,
    scope: Scope,
    body: UploadSessionCreate,
  ): Promise<Replayable<UploadSessionView>> {
    const userId = principal.userId;
    // a resent create answers the session the first one made, while it is still usable
    const existing = await this.prisma.uploadSession.findUnique({
      where: { userId_clientUuid: { userId, clientUuid: body.clientUuid } },
    });
    if (existing) return { value: replayOf(existing, body, this.clock.now()), replay: true };
    if (!kindAllowedOn(body.entityType, body.kind))
      throw new ApiError('file.kind_not_allowed', 422);
    const limit = maxSizeOf(body.kind, body.mime);
    if (limit === null) throw new ApiError('file.type_not_allowed', 415);
    if (body.sizeBytes > limit) throw new ApiError('file.too_large', 413);
    const record = await this.recordInReach(
      scope,
      body.entityType as UploadRecordType,
      body.entityId,
    );
    const fileId = uuidv7();
    const declared: Declared = { ...body, sha256: body.sha256.toLowerCase(), fileId };
    const objectKey = objectKeyOf({
      fileId,
      kind: body.kind,
      type: body.mime as FileType,
      entityType: body.entityType,
      entityId: body.entityId,
      projectCode: record.projectCode,
      programCode: record.programCode,
      year: record.year,
      applicationId: record.applicationId,
      districtCode: record.districtCode,
    });
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // one create of a user at a time, so the count of open sessions holds
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 1))`;
        const now = this.clock.now();
        const open = await tx.uploadSession.count({
          where: { userId, finalizedFileId: null, expiresAt: { gt: now } },
        });
        if (open >= UPLOAD_RULES.openSessions) throw new ApiError('file.sessions_limit', 429);
        return tx.uploadSession.create({
          data: {
            id: uuidv7(),
            userId,
            clientUuid: body.clientUuid,
            declared: declared as unknown as Prisma.InputJsonValue,
            bucket: bucketOf(body.kind),
            objectKey,
            partCount: partCount(body.sizeBytes),
            expiresAt: expiry(now),
            createdBy: userId,
          },
        });
      });
      return { value: sessionView(created), replay: false };
    } catch (error) {
      // two creates with one client id at once: the second answers the first one's session
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.prisma.uploadSession.findUnique({
        where: { userId_clientUuid: { userId, clientUuid: body.clientUuid } },
      });
      if (!raced) throw error;
      return { value: replayOf(raced, body, this.clock.now()), replay: true };
    }
  }

  async get(principal: Principal, sessionId: string): Promise<UploadSessionView> {
    return sessionView(await this.openSession(principal, sessionId));
  }

  /** Stores one part; a part the session already holds answers the same without a write. */
  async putPart(
    principal: Principal,
    sessionId: string,
    part: number,
    body: unknown,
  ): Promise<UploadSessionView> {
    const session = await this.openSession(principal, sessionId);
    if (session.finalizedFileId || session.partsReceived.includes(part))
      return sessionView(session);
    if (part > session.partCount) throw new ApiError('file.part_out_of_range', 422);
    if (!Buffer.isBuffer(body) || body.length === 0)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'body', code: 'validation.failed' },
      ]);
    const declared = declaredOf(session);
    const expected =
      part < session.partCount
        ? UPLOAD_RULES.partSize
        : declared.sizeBytes - (session.partCount - 1) * UPLOAD_RULES.partSize;
    if (body.length > expected) throw new ApiError('file.too_large', 413);
    if (body.length < expected)
      throw new ApiError('validation.failed', 422, undefined, [
        { path: 'body', code: 'validation.failed' },
      ]);
    await storePart(this.storage, session.id, part, body);
    // counted once even when the same part arrives twice at the same moment
    await this.prisma.$executeRaw`
      UPDATE upload_sessions
         SET parts_received = array_append(parts_received, ${part}::int),
             bytes_received = bytes_received + ${body.length}::bigint,
             expires_at = ${expiry(this.clock.now())}
       WHERE id = ${session.id}::uuid AND finalized_file_id IS NULL
         AND NOT (${part}::int = ANY (parts_received))`;
    return sessionView(await this.openSession(principal, sessionId));
  }

  /**
   * The new file, or the file an earlier finalize of the session made (`replay`). One finalize of
   * a session runs at a time: a second one waits for the first and then answers its file.
   */
  async finalize(
    principal: Principal,
    scope: Scope,
    sessionId: string,
  ): Promise<Replayable<UploadedFileView>> {
    const session = await this.ownSession(principal, sessionId);
    if (session.finalizedFileId)
      return { value: await this.fileView(session.finalizedFileId), replay: true };
    if (session.expiresAt <= this.clock.now()) throw new ApiError('file.session_expired', 410);
    const declared = declaredOf(session);
    const record = await this.recordInReach(
      scope,
      declared.entityType as UploadRecordType,
      declared.entityId,
    );
    if (session.partsReceived.length < session.partCount)
      throw new ApiError('file.parts_missing', 409);
    await this.refuseDuplicate(scope, record.projectId, declared);
    const bucket = session.bucket as Bucket;
    let wrote = false;
    try {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${session.id}, 0))`;
          // the row lock also keeps the nightly sweep away until this finalize ends
          const [locked] = await tx.$queryRaw<{ finalized_file_id: string | null }[]>`
            SELECT finalized_file_id FROM upload_sessions WHERE id = ${session.id}::uuid FOR UPDATE`;
          if (!locked) throw new ApiError('file.session_expired', 410);
          if (locked.finalized_file_id) return { fileId: locked.finalized_file_id, replay: true };
          const type = (await joinParts(this.storage, {
            sessionId: session.id,
            count: session.partCount,
            size: declared.sizeBytes,
            sha256: declared.sha256,
            bucket,
            key: session.objectKey,
            headLength: MAGIC_LENGTH,
            accept: (head) => acceptedType(head, declared),
          })) as FileType;
          wrote = true;
          await this.writeFile(tx, principal, session, declared, record, type);
          return { fileId: declared.fileId, replay: false };
        },
        { maxWait: FINALIZE_WAIT_MS, timeout: FINALIZE_TIMEOUT_MS },
      );
      if (!outcome.replay) await this.dropPartsQuietly(session.id);
      return { value: await this.fileView(outcome.fileId), replay: outcome.replay };
    } catch (error) {
      // only the finalize that wrote the object removes it; a waiting one never touches it
      if (wrote) await this.removeQuietly(bucket, session.objectKey);
      if (isUniqueViolation(error)) throw new ApiError('file.duplicate', 409);
      throw error;
    }
  }

  /** The file row, its link, the finalized session and the audit entry, in the finalize's transaction. */
  private async writeFile(
    tx: Tx,
    principal: Principal,
    session: SessionRow & { objectKey: string; bucket: string },
    declared: Declared,
    record: UploadRecord,
    type: FileType,
  ): Promise<void> {
    // the record's own device time where it keeps one, else what the phone declared
    const recordCreatedAt =
      record.clientCreatedAt ??
      (declared.recordCreatedAt ? new Date(declared.recordCreatedAt) : null);
    const flags = photoFlags(declared, type, recordCreatedAt, this.clock.now());
    await tx.file.create({
      data: {
        id: declared.fileId,
        bucket: session.bucket,
        objectKey: session.objectKey,
        kind: declared.kind,
        mime: type,
        sizeBytes: BigInt(declared.sizeBytes),
        sha256: declared.sha256,
        projectId: record.projectId,
        uploadedBy: principal.userId,
        capturedAt: declared.capturedAt ? new Date(declared.capturedAt) : null,
        recordCreatedAt,
        latitude: declared.gps?.lat ?? null,
        longitude: declared.gps?.lng ?? null,
        gpsAccuracyM: declared.gps?.accuracyM ?? null,
        source: declared.source,
        flags,
        clientUuid: declared.clientUuid,
        createdBy: principal.userId,
      },
    });
    await tx.fileLink.create({
      data: {
        id: uuidv7(),
        fileId: declared.fileId,
        entityType: declared.entityType,
        entityId: declared.entityId,
        slot: declared.slot,
        clientUuid: declared.clientUuid,
        createdBy: principal.userId,
      },
    });
    await tx.uploadSession.update({
      where: { id: session.id },
      data: { finalizedFileId: declared.fileId },
    });
    // the position is personal data: the audit entry names the record and the file, never the place
    await this.audit.record(tx, {
      action: 'file.uploaded',
      entityType: 'file',
      entityId: declared.fileId,
      clientUuid: declared.clientUuid,
      new: {
        kind: declared.kind,
        entityType: declared.entityType,
        entityId: declared.entityId,
        slot: declared.slot,
        size: declared.sizeBytes,
        flags,
      },
    });
  }

  /**
   * The same bytes are already in the project: refused, naming the other file only to a caller
   * whose scope reaches one of its records; anyone else learns only that such a file exists.
   */
  private async refuseDuplicate(
    scope: Scope,
    projectId: string,
    declared: Declared,
  ): Promise<void> {
    const other = await this.prisma.file.findFirst({
      where: {
        projectId,
        sha256: declared.sha256,
        kind: { not: 'export' },
        id: { not: declared.fileId },
      },
      select: { id: true, fileLinksFile: { select: { entityType: true, entityId: true } } },
    });
    if (!other) return;
    for (const link of other.fileLinksFile) {
      if (!Object.hasOwn(UPLOAD_RECORD_KINDS, link.entityType)) continue;
      const linked = await loadUploadRecord(
        this.prisma,
        link.entityType as UploadRecordType,
        link.entityId,
      );
      if (linked && (await scopeReachesRecord(this.prisma, scope, linked)))
        throw new ApiError('file.duplicate', 409, { fileId: other.id });
    }
    throw new ApiError('file.duplicate', 409);
  }

  /** The record a file is to link to, inside the caller's scope and on a project that takes files. */
  private async recordInReach(
    scope: Scope,
    entityType: UploadRecordType,
    entityId: string,
  ): Promise<UploadRecord> {
    const record = await loadUploadRecord(this.prisma, entityType, entityId);
    if (!record || !(await scopeReachesRecord(this.prisma, scope, record))) {
      this.access.denied(scope.actorId, scope.permission, entityType);
      throw new ApiError('permission.not_found', 404);
    }
    if (!OPEN_PROJECT.has(record.projectStatus)) throw new ApiError('project.read_only', 409);
    return record;
  }

  /** The caller's own session, or 404 for any other id (no existence leak). */
  private async ownSession(principal: Principal, sessionId: string) {
    const session = await this.prisma.uploadSession.findFirst({
      where: { id: sessionId, userId: principal.userId },
    });
    if (!session) throw new ApiError('permission.not_found', 404);
    return session;
  }

  /** The caller's session while parts may still arrive or after it was finalized; 410 once expired. */
  private async openSession(principal: Principal, sessionId: string) {
    const session = await this.ownSession(principal, sessionId);
    if (!session.finalizedFileId && session.expiresAt <= this.clock.now())
      throw new ApiError('file.session_expired', 410);
    return session;
  }

  private async fileView(fileId: string): Promise<UploadedFileView> {
    const file = await this.prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    return {
      id: file.id,
      kind: file.kind,
      mime: file.mime,
      sizeBytes: Number(file.sizeBytes),
      capturedAt: file.capturedAt?.toISOString() ?? null,
      uploadedAt: file.uploadedAt.toISOString(),
      virusScan: file.virusScan,
      flags: file.flags,
      duplicateOf: null,
    };
  }

  private async dropPartsQuietly(sessionId: string): Promise<void> {
    try {
      await dropParts(this.storage, sessionId);
    } catch (error) {
      // the uploads bucket empties itself after two days; nothing points at the parts any more
      this.logger.warn({ err: error }, 'upload parts not removed');
    }
  }

  private async removeQuietly(bucket: Bucket, key: string): Promise<void> {
    try {
      await this.storage.remove(bucket, key);
    } catch (error) {
      this.logger.warn({ err: error, bucket }, 'upload object not removed');
    }
  }
}

const expiry = (now: Date) => new Date(now.getTime() + UPLOAD_RULES.sessionLifeMs);

function declaredOf(session: { declared: unknown }): Declared {
  return declaredSchema.parse(session.declared);
}

function sessionView(session: SessionRow): UploadSessionView {
  return {
    id: session.id,
    chunkSize: UPLOAD_RULES.partSize,
    partCount: session.partCount,
    partsReceived: [...session.partsReceived].sort((a, b) => a - b),
    bytesReceived: Number(session.bytesReceived),
    expiresAt: session.expiresAt.toISOString(),
    fileId: session.finalizedFileId,
  };
}

/** The fields that make two creates the same upload. */
const SAME_UPLOAD = ['kind', 'entityType', 'entityId', 'slot', 'mime', 'sizeBytes'] as const;

/**
 * The session an earlier create with the same client id made: refused once it expired unfinished
 * (the device starts over with a new id), and when the request describes another file.
 */
function replayOf(
  session: SessionRow & { declared: unknown },
  body: UploadSessionCreate,
  now: Date,
): UploadSessionView {
  if (!session.finalizedFileId && session.expiresAt <= now)
    throw new ApiError('file.session_expired', 410);
  const declared = declaredOf(session);
  if (
    SAME_UPLOAD.some((field) => declared[field] !== body[field]) ||
    declared.sha256 !== body.sha256.toLowerCase()
  )
    throw new ApiError('file.session_mismatch', 409);
  return sessionView(session);
}

/** The type of the joined bytes, when it is the declared one and the kind takes it; else 415. */
function acceptedType(head: Buffer, declared: Declared): FileType {
  const type = detectType(head);
  if (!type || !sameFileType(type, declared.mime) || maxSizeOf(declared.kind, type) === null)
    throw new ApiError('file.type_not_allowed', 415);
  return type;
}

/**
 * The data-quality flags the declaration already decides for a photo: no capture time, no
 * position, and a stale capture: more than ten minutes from the record's creation, or after the
 * server's clock. They never block.
 */
function photoFlags(
  declared: Declared,
  type: FileType,
  recordCreatedAt: Date | null,
  now: Date,
): string[] {
  if (!type.startsWith('image/') || declared.kind === 'document') return [];
  const flags: string[] = [];
  if (!declared.capturedAt) flags.push('no_capture_time');
  if (!declared.gps) flags.push('no_gps');
  const captured = declared.capturedAt ? Date.parse(declared.capturedAt) : null;
  const far = (a: number, b: number) => Math.abs(a - b) > UPLOAD_RULES.staleCaptureMs;
  if (
    captured !== null &&
    ((recordCreatedAt && far(captured, recordCreatedAt.getTime())) ||
      captured - now.getTime() > UPLOAD_RULES.staleCaptureMs)
  )
    flags.push('stale_capture');
  return flags;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
