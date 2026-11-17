import { EXPORT_PERMISSION_OF_CLASS, isExportRecord } from '@css/shared/exports';
import { holdsPermission } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';
import { stillHeld } from './reach.js';
import { readFrozenRecord, RECORD_PERMISSION } from './records.js';
import { readFrozenExport, sensitiveClasses } from './service.js';

export interface ExportDownload {
  file: {
    id: string;
    bucket: string;
    objectKey: string;
    mime: string;
    sizeBytes: bigint;
  };
  job: {
    id: string;
    kind: string;
    format: string;
    sensitive: boolean;
    rowCount: number | null;
    createdAt: Date;
  };
}

/**
 * Whether the caller may download an export file, checked again at every download (docs/api/
 * API_STANDARDS.md, "Export job pattern"): only the job's requester, only while their account is
 * active and their live access still holds `export.list` (a record's PDF: its own export
 * permission), for a file with protected fields the export permissions of those fields, every
 * protected class it holds and the reach of every record in it. Anyone else, and the requester who lost one of them, gets
 * 404; the requester gets 410 once the file has expired. Null for a file that is not an export.
 */
export async function exportDownload(
  prisma: PrismaService,
  access: AccessService,
  principal: Principal,
  fileId: string,
): Promise<ExportDownload | null> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      kind: true,
      mime: true,
      sizeBytes: true,
      deletedAt: true,
    },
  });
  if (!file || file.kind !== 'export') return null;
  const refused = () => {
    access.denied(principal.userId, 'export.list', 'file');
    return new ApiError('permission.not_found', 404);
  };
  const job = await prisma.exportJob.findFirst({
    where: { fileId, requestedBy: principal.userId },
    select: {
      id: true,
      kind: true,
      format: true,
      sensitive: true,
      rowCount: true,
      createdAt: true,
      columns: true,
      access: true,
    },
  });
  if (!job) throw refused();
  const [user, live] = await Promise.all([
    prisma.user.findUnique({ where: { id: principal.userId }, select: { state: true } }),
    access.load(principal.userId),
  ]);
  if (user?.state !== 'active') throw refused();
  const classes = heldClasses(job);
  if (!classes) throw refused();
  // a record's PDF needs its own export permission, a list's export.list
  const needed = new Set([isExportRecord(job.kind) ? RECORD_PERMISSION[job.kind] : 'export.list']);
  if (job.sensitive) {
    for (const cls of classes)
      if (Object.hasOwn(EXPORT_PERMISSION_OF_CLASS, cls))
        // an own key of the constant table, checked on the line above
        // eslint-disable-next-line security/detect-object-injection
        needed.add(EXPORT_PERMISSION_OF_CLASS[cls]!);
  }
  if ([...needed].some((p) => !holdsPermission(p, live.grants))) throw refused();
  if (file.deletedAt) throw new ApiError('export.expired', 410);
  if (!(await stillHeld(prisma, access, principal, live, job))) throw refused();
  return {
    file,
    job: {
      id: job.id,
      kind: job.kind,
      format: job.format,
      sensitive: job.sensitive,
      rowCount: job.rowCount,
      createdAt: job.createdAt,
    },
  };
}

/** The protected classes a job's file holds, or null when its row does not say. */
function heldClasses(job: {
  kind: string;
  sensitive: boolean;
  columns: string[];
  access: unknown;
}): string[] | null {
  if (isExportRecord(job.kind)) return readFrozenRecord(job.access)?.classes ?? null;
  if (!job.sensitive) return [];
  const frozen = readFrozenExport(job.access);
  if (!frozen) return null;
  return sensitiveClasses(
    frozen.list.kind,
    job.columns,
    frozen.questions,
    new Set(frozen.list.classes),
  );
}

/** Dhaka is six hours ahead of UTC all year. */
const DHAKA_MS = 6 * 60 * 60 * 1000;

/**
 * The name a downloaded export is saved under: the list, the day it was asked for in Dhaka, the
 * format.
 */
export function exportFileName(
  job: Pick<ExportDownload['job'], 'kind' | 'format' | 'createdAt'>,
): string {
  const day = new Date(job.createdAt.getTime() + DHAKA_MS).toISOString().slice(0, 10);
  return `${job.kind}-${day}.${job.format}`;
}
