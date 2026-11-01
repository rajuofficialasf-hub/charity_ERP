import { EXPORT_PERMISSION_OF_CLASS } from '@css/shared/exports';
import { holdsPermission } from '../access/scope';
import type { AccessService } from '../access/service';
import type { Principal } from '../auth/principal';
import type { PrismaService } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import { readFrozenExport, sensitiveClasses } from './service';

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
 * active and their live access still holds `export.list` and, for a file with protected fields,
 * the export permissions of those fields. Anyone else, and the requester who lost one of them, gets
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
  const needed = new Set(['export.list']);
  if (job.sensitive) {
    const frozen = readFrozenExport(job.access);
    if (!frozen) throw refused();
    const classes = sensitiveClasses(
      frozen.list.kind,
      job.columns,
      frozen.questions,
      new Set(frozen.list.classes),
    );
    for (const cls of classes)
      if (Object.hasOwn(EXPORT_PERMISSION_OF_CLASS, cls))
        // an own key of the constant table, checked on the line above
        // eslint-disable-next-line security/detect-object-injection
        needed.add(EXPORT_PERMISSION_OF_CLASS[cls]!);
  }
  if ([...needed].some((p) => !holdsPermission(p, live.grants))) throw refused();
  if (file.deletedAt) throw new ApiError('export.expired', 410);
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
