import { columnsOf, type ExportList, isExportRecord } from '@css/shared/exports';
import type { AccessService, RequestAccess } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { readFrozenRecord } from './records.js';
import { ENTITY, READ_PERMISSION, whereOf } from './rows.js';
import { readFrozenExport } from './service.js';

/**
 * Whether the requester may still hold what an export file holds, checked again at its download
 * (docs/api/API_STANDARDS.md, "Export job pattern"): every protected field class of its columns
 * (or of its record) is one they still see, and every record of the file is still in their reach.
 * A file whose row cannot be read is refused.
 */
export async function stillHeld(
  prisma: PrismaService,
  access: AccessService,
  principal: Principal,
  live: RequestAccess,
  job: { kind: string; columns: string[]; access: unknown },
): Promise<boolean> {
  if (!isExportRecord(job.kind)) {
    const list = job.kind as ExportList;
    const frozen = readFrozenExport(job.access);
    if (!frozen) return false;
    const catalogue = new Map(columnsOf(list).map((c) => [c.id, c.cls]));
    const classes = [
      ...job.columns.map((id) => catalogue.get(id) ?? null),
      ...frozen.questions.map((q) => q.cls),
    ];
    if (classes.some((cls) => cls !== null && !live.fieldClasses.has(cls))) return false;
    return reachesEveryRow(prisma, access, principal, live, list, frozen.list.where);
  }
  const record = readFrozenRecord(job.access);
  if (!record) return false;
  if (record.classes.some((cls) => !live.fieldClasses.has(cls))) return false;
  if (record.kind === 'beneficiary_profile') {
    const scope = await access.scopeFor(principal, live, 'beneficiary.view_all', 'beneficiary');
    return access.reaches(scope, { beneficiaryId: record.recordId });
  }
  const scope = await access.scopeFor(principal, live, 'application.view', 'application');
  return access.reaches(scope, { applicationId: record.recordId });
}

/** Whether the list's scope of now reaches every record the frozen query selects. */
async function reachesEveryRow(
  prisma: PrismaService,
  access: AccessService,
  principal: Principal,
  live: RequestAccess,
  list: ExportList,
  where: unknown,
): Promise<boolean> {
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  const scope = await access.scopeFor(principal, live, READ_PERMISSION[list], ENTITY[list]);
  const reached = { AND: [where, whereOf(list, scope)] };
  if (list === 'volunteers') {
    const [all, inReach] = await Promise.all([
      prisma.volunteer.count({ where: where as Prisma.VolunteerWhereInput }),
      prisma.volunteer.count({ where: reached as Prisma.VolunteerWhereInput }),
    ]);
    return all === inReach;
  }
  if (list === 'beneficiaries') {
    const [all, inReach] = await Promise.all([
      prisma.beneficiary.count({ where: where as Prisma.BeneficiaryWhereInput }),
      prisma.beneficiary.count({ where: reached as Prisma.BeneficiaryWhereInput }),
    ]);
    return all === inReach;
  }
  const [all, inReach] = await Promise.all([
    prisma.application.count({ where: where as Prisma.ApplicationWhereInput }),
    prisma.application.count({ where: reached as Prisma.ApplicationWhereInput }),
  ]);
  return all === inReach;
}
