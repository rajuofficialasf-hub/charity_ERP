import { columnsOf, type ExportList, isExportRecord } from '@css/shared/exports';
import { holdsPermission } from '../access/scope.js';
import type { AccessService, RequestAccess } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import { boundedRead } from '../core/bounded-read.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { readFrozenRecord, RECORD_PERMISSION } from './records.js';
import { ENTITY, READ_PERMISSION, REACHED, whereOf } from './rows.js';
import { type FrozenExport, readFrozenExport } from './service.js';

/**
 * Whether the requester may still hold what an export file holds, checked again at its download
 * (docs/api/API_STANDARDS.md, "Export job pattern"): every protected field class of its columns
 * (or of its record) is one they still see, and every record of the file is still in their reach,
 * for the list as a whole and for each protected class only some records carry. A file whose row
 * cannot be read is refused.
 */
export async function stillHeld(
  prisma: PrismaService,
  access: AccessService,
  principal: Principal,
  live: RequestAccess,
  job: { kind: string; columns: string[]; access: unknown },
): Promise<boolean> {
  if (isExportRecord(job.kind)) {
    const record = readFrozenRecord(job.access);
    if (!record) return false;
    if ((record.held ?? record.classes).some((cls) => !live.fieldClasses.has(cls))) return false;
    const target =
      record.kind === 'beneficiary_profile'
        ? { beneficiaryId: record.recordId }
        : { applicationId: record.recordId };
    const entity = record.kind === 'beneficiary_profile' ? 'beneficiary' : 'application';
    // the scopes the record was read in at the request: a profile through the journey report and
    // the beneficiary tab, an application through its view
    const permissions =
      record.kind === 'beneficiary_profile'
        ? [RECORD_PERMISSION.beneficiary_profile, 'beneficiary.view_all']
        : ['application.view'];
    for (const permission of permissions) {
      const scope = await access.scopeFor(principal, live, permission, entity);
      if (!(await access.reaches(scope, target))) return false;
    }
    return true;
  }
  const list = job.kind as ExportList;
  const frozen = readFrozenExport(job.access);
  if (!frozen) return false;
  const catalogue = new Map(columnsOf(list).map((c) => [c.id, c.cls]));
  const classes = new Set(
    [
      ...job.columns.map((id) => catalogue.get(id) ?? null),
      ...frozen.questions.map((q) => q.cls),
    ].filter((cls): cls is string => cls !== null),
  );
  if ([...classes].some((cls) => !live.fieldClasses.has(cls))) return false;
  const rows = frozen.list.where;
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  const entity = ENTITY[list];
  const reachedNow = async (permission: string) =>
    holdsPermission(permission, live.grants)
      ? whereOf(list, await access.scopeFor(principal, live, permission, entity))
      : { id: { in: [] } };
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  if (!(await sameRows(prisma, list, rows, await reachedNow(READ_PERMISSION[list])))) return false;
  // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
  for (const rule of REACHED[list]) {
    if (!rule.classes.some((cls) => classes.has(cls))) continue;
    const before = frozenReach(frozen, rule.classes);
    // the rows that carried the class in the file must still be inside its reach of now
    const carried = before === null ? rows : { AND: [rows, before] };
    const now: unknown[] = [];
    for (const permission of [rule.view, rule.exported])
      if (permission !== null) now.push(await reachedNow(permission));
    if (!(await sameRows(prisma, list, carried, { AND: now }))) return false;
  }
  return true;
}

/** The frozen reach of one class rule, or null when the export stored none for it. */
function frozenReach(frozen: FrozenExport, classes: readonly string[]): unknown {
  const kept = frozen.list.reach.find((r) => r.classes.some((cls) => classes.includes(cls)));
  return kept ? kept.where : null;
}

/**
 * Whether every row a query of the list selects is also selected with the reach of now added, in
 * one read under the time limit of the list reads.
 */
function sameRows(
  prisma: PrismaService,
  list: ExportList,
  where: unknown,
  reach: unknown,
): Promise<boolean> {
  return boundedRead(prisma, async (tx) => {
    const all = await countOf(tx, list, where);
    return all === (await countOf(tx, list, { AND: [where, reach] }));
  });
}

function countOf(tx: Tx, list: ExportList, where: unknown): Promise<number> {
  if (list === 'volunteers')
    return tx.volunteer.count({ where: where as Prisma.VolunteerWhereInput });
  if (list === 'beneficiaries')
    return tx.beneficiary.count({ where: where as Prisma.BeneficiaryWhereInput });
  return tx.application.count({ where: where as Prisma.ApplicationWhereInput });
}
